/**
 * Source adapters: foreign metadata formats → AMB.
 *
 * Each adapter converts one upstream API or format into AMB, so the core
 * converter only ever has to deal with AMB itself.
 */

export * as sodix from './sodix/index.js';
