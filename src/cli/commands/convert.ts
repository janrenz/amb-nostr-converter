import { Command } from 'commander';
import { readInput, writeOutput, parseJSON, parseJSONLines, formatJSON } from '../utils/file-io.js';
import { success, error as displayError, info } from '../utils/output.js';
import { ambToNostr, nostrToAmb } from '../../converters/index.js';
import { ConversionOptions } from '../../types/index.js';
import { parsePrivateKey, derivePublicKey, signNostrEvent } from '../../utils/signing.js';

/**
 * Conversion direction
 */
type ConversionDirection = 'amb:nostr' | 'nostr:amb';

/**
 * created_at for item `index` of a bulk conversion of `total` items.
 *
 * Each event needs its own created_at: a batch sharing one timestamp breaks
 * relays that paginate with `until = oldest - 1`, which drops events silently
 * or loops. The seconds therefore step by one per item.
 *
 * They step *backwards* from `now`, so the batch ends at the present instead of
 * running `total` seconds into the future. Future-dating is not cosmetic here:
 * kind-30142 is addressable, so a relay keeps the highest created_at per
 * kind:pubkey:d — a correction published later at real wall-clock time would
 * look older than the synthetic stamp and be discarded unseen. Observed on a
 * 16,139-record SODIX ingest whose last event was dated 4h29m ahead.
 */
export function bulkTimestamp(now: number, index: number, total: number): number {
  return now - (total - 1 - index);
}

/**
 * Parse conversion direction from string
 */
function parseDirection(direction: string): ConversionDirection {
  const normalized = direction.toLowerCase().trim();
  
  if (normalized === 'amb:nostr' || normalized === 'amb-nostr') {
    return 'amb:nostr';
  }
  
  if (normalized === 'nostr:amb' || normalized === 'nostr-amb') {
    return 'nostr:amb';
  }
  
  throw new Error(
    `Invalid conversion direction: "${direction}". Must be "amb:nostr" or "nostr:amb"`
  );
}

interface ConvertCommandOptions {
  output?: string;
  pretty?: boolean;
  tags?: boolean;
  nsec?: string;
  privateKey?: string;
}

/**
 * Execute conversion
 */
async function executeConvert(
  direction: ConversionDirection,
  inputFilePath: string | undefined,
  options: ConvertCommandOptions
): Promise<void> {
  try {
    // Validate mutually exclusive options
    if (options.nsec && options.privateKey) {
      throw new Error('Cannot specify both --nsec and --private-key options');
    }
    
    // Read input data
    const inputData = await readInput(inputFilePath);
    
    if (!inputData.trim()) {
      throw new Error('Input is empty');
    }
    
    // Handle private key if provided (only for amb:nostr direction)
    let privateKeyHex: string | undefined;
    let derivedPubkey: string | undefined;

    if (direction === 'amb:nostr' && (options.nsec || options.privateKey)) {
      const keyInput = options.nsec || options.privateKey!;
      privateKeyHex = parsePrivateKey(keyInput);
      derivedPubkey = derivePublicKey(privateKeyHex);
      info(`Derived pubkey: ${derivedPubkey}`);
    }

    // Prepare conversion options
    const conversionOptions: ConversionOptions = {};

    // Use derived pubkey if signing
    if (derivedPubkey) {
      conversionOptions.pubkey = derivedPubkey;
    }

    // Detect JSONL vs single JSON
    let inputs: any[];
    let isJsonl = false;

    try {
      const singleJson = parseJSON(inputData);
      inputs = [singleJson];
    } catch {
      // Single JSON parse failed — try JSONL
      inputs = parseJSONLines(inputData);
      isJsonl = true;
    }

    // Warn about inapplicable options for nostr:amb
    if (direction === 'nostr:amb') {
      if (options.nsec || options.privateKey) {
        console.error('⚠ Warning: --nsec and --private-key options are ignored for nostr:amb conversion');
      }
      if (options.tags) {
        console.error('⚠ Warning: --tags option is ignored for nostr:amb conversion');
      }
    }

    info(`Converting ${isJsonl ? `${inputs.length} objects` : '1 object'} ${direction === 'amb:nostr' ? 'AMB to Nostr' : 'Nostr to AMB'}...`);

    const results: string[] = [];
    let errorCount = 0;

    // Unique created_at per item, stepping back from now (see bulkTimestamp).
    const baseTimestamp = Math.floor(Date.now() / 1000);

    for (let i = 0; i < inputs.length; i++) {
      const inputJson = inputs[i];
      const lineLabel = isJsonl ? ` (line ${i + 1})` : '';

      try {
        let result: any;

        if (direction === 'amb:nostr') {
          const itemOptions = inputs.length > 1
            ? { ...conversionOptions, timestamp: bulkTimestamp(baseTimestamp, i, inputs.length) }
            : conversionOptions;
          const conversionResult = ambToNostr(inputJson, itemOptions);

          if (!conversionResult.success) {
            throw new Error(conversionResult.error?.message || 'Conversion failed');
          }

          if (conversionResult.warnings && conversionResult.warnings.length > 0) {
            conversionResult.warnings.forEach(warning => {
              console.error(`⚠ Warning${lineLabel}: ${warning}`);
            });
          }

          if (!conversionResult.data) {
            throw new Error('Conversion succeeded but no data was returned');
          }

          let event = conversionResult.data;

          if (privateKeyHex) {
            event = signNostrEvent(event, privateKeyHex);
            info(`Event ID${lineLabel}: ${event.id}`);
          }

          result = options.tags ? event.tags : event;
        } else {
          const conversionResult = nostrToAmb(inputJson);

          if (!conversionResult.success) {
            throw new Error(conversionResult.error?.message || 'Conversion failed');
          }

          if (!conversionResult.data) {
            throw new Error('Conversion succeeded but no data was returned');
          }

          result = conversionResult.data;
        }

        results.push(formatJSON(result, options.pretty));
      } catch (err) {
        errorCount++;
        console.error(`✗ Error${lineLabel}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (results.length === 0) {
      throw new Error('All conversions failed');
    }

    // Join results: pretty mode uses blank line separator, compact uses newline
    const separator = options.pretty ? '\n\n' : '\n';
    const outputData = results.join(separator);

    // Write output
    await writeOutput(outputData, options.output);
    
    if (options.output) {
      success(`Conversion complete! Output written to: ${options.output}`);
    } else {
      // Data already written to stdout, just show success to stderr
      success('Conversion complete!');
    }
    
  } catch (err) {
    displayError(
      err instanceof Error ? err.message : 'Unknown error occurred'
    );
    process.exit(1);
  }
}

/**
 * Create convert command
 */
export function createConvertCommand(): Command {
  const command = new Command();
  
  command
    .description('Convert between AMB and Nostr educational event formats')
    .argument('<direction>', 'Conversion direction: "amb:nostr" or "nostr:amb"')
    .argument('[input]', 'Input file path (omit to read from stdin)')
    .option('-o, --output <file>', 'Output file path (omit to write to stdout)')
    .option('-p, --pretty', 'Pretty-print JSON output', false)
    .option('--tags', 'Output only the tags array', false)
    .option('--nsec <key>', 'Sign event with nsec (bech32 format private key)')
    .option('--private-key <key>', 'Sign event with hex private key')
    .action(async (directionStr: string, inputFile: string | undefined, options: ConvertCommandOptions) => {
      try {
        const direction = parseDirection(directionStr);
        await executeConvert(direction, inputFile, options);
      } catch (err) {
        displayError(
          err instanceof Error ? err.message : 'Unknown error occurred'
        );
        process.exit(1);
      }
    });

  return command;
}
