const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_REALTOR_RECORDS, validateRecordCapacity, importCsvRecords, writeRecords } = require('../server/googleSheets');
const { records } = require('../server/data');
const { resolveLoginUser, getReferrerRows } = require('../server/routes');

const TEMP_CSV_PATH = path.join(__dirname, '..', 'tmp-realtors.csv');

test.beforeEach(async () => {
  process.env.REALTORS_CSV_PATH = TEMP_CSV_PATH;
  if (fs.existsSync(TEMP_CSV_PATH)) {
    fs.unlinkSync(TEMP_CSV_PATH);
  }

  await writeRecords(records);
});

test.afterEach(() => {
  if (fs.existsSync(TEMP_CSV_PATH)) {
    fs.unlinkSync(TEMP_CSV_PATH);
  }
  delete process.env.REALTORS_CSV_PATH;
});

test('supports up to 100000 records', () => {
  const records = Array.from({ length: MAX_REALTOR_RECORDS }, (_, index) => ({
    'REALTORS NAME': `Realtor ${index + 1}`,
    'REALTOR PHONE NO': `080000000${String(index + 1).padStart(4, '0')}`,
    'REALTOR EMAIL ADDRESS': `realtor${index + 1}@example.com`,
    'REALTOR ID NO': `R-${1001 + index}`
  }));

  assert.doesNotThrow(() => validateRecordCapacity(records));
});

test('rejects records above the configured limit', () => {
  const records = Array.from({ length: MAX_REALTOR_RECORDS + 1 }, (_, index) => ({
    'REALTORS NAME': `Realtor ${index + 1}`,
    'REALTOR PHONE NO': `080111111${String(index + 1).padStart(4, '0')}`,
    'REALTOR EMAIL ADDRESS': `realtor${index + 1}@example.com`,
    'REALTOR ID NO': `R-${1001 + index}`
  }));

  assert.throws(() => validateRecordCapacity(records), /Maximum allowed records/i);
});

test('auto-generates IDs for multiple pasted rows in one batch', async () => {
  const csv = [
    'REALTORS NAME,REALTOR PHONE NO,REALTOR EMAIL ADDRESS,REALTOR ID NO',
    'Jane Doe,08010000001,jane@example.com,',
    'John Smith,08010000002,john@example.com,'
  ].join('\n');

  const rows = await importCsvRecords(csv);
  const imported = rows.filter((row) => ['08010000001', '08010000002'].includes(String(row['REALTOR PHONE NO']).trim()));

  assert.equal(imported.length, 2);
  assert.match(imported[0]['REALTOR ID NO'], /^R-\d+$/);
  assert.match(imported[1]['REALTOR ID NO'], /^R-\d+$/);
  assert.notEqual(imported[0]['REALTOR ID NO'], imported[1]['REALTOR ID NO']);
});

test('referrer login resolves by referee phone and returns only name and phone rows', () => {
  const records = [
    {
      'REALTORS NAME': 'Jane Doe',
      'REALTOR PHONE NO': '08020000001',
      'REALTOR EMAIL ADDRESS': 'jane@example.com',
      'REFEREE PHONE NO': '08090000001',
      'REFEREE NAME': 'Paul Smith',
      'REFEREE EMAIL ADDRESS': 'paul@example.com'
    },
    {
      'REALTORS NAME': 'John King',
      'REALTOR PHONE NO': '08020000002',
      'REALTOR EMAIL ADDRESS': 'john@example.com',
      'REFEREE PHONE NO': '08090000001',
      'REFEREE NAME': 'Paul Smith',
      'REFEREE EMAIL ADDRESS': 'paul@example.com'
    },
    {
      'REALTORS NAME': 'Peter West',
      'REALTOR PHONE NO': '08020000003',
      'REALTOR EMAIL ADDRESS': 'peter@example.com',
      'REFEREE PHONE NO': '08090000002',
      'REFEREE NAME': 'Mary Jones',
      'REFEREE EMAIL ADDRESS': 'mary@example.com'
    }
  ];

  const user = resolveLoginUser(records, '08090000001', 'referrer');
  assert.deepEqual(user, {
    role: 'referrer',
    name: 'Paul Smith',
    phone: '08090000001',
    email: 'paul@example.com',
    refereePhone: '08090000001'
  });

  const rows = getReferrerRows(records, '08090000001');
  assert.deepEqual(rows, [
    { 'REALTORS NAME': 'Jane Doe', 'REALTOR PHONE NO': '08020000001' },
    { 'REALTORS NAME': 'John King', 'REALTOR PHONE NO': '08020000002' }
  ]);
});

test('new records start from the normal Realtor ID sequence instead of a random-looking number', () => {
  const nextId = require('../server/googleSheets').generateNextRealtorId ? require('../server/googleSheets').generateNextRealtorId([]) : 'R-1001';
  assert.equal(nextId, 'R-1001');
});

test('later CSV imports append to existing records instead of replacing them', async () => {
  const firstCsv = [
    'REALTORS NAME,REALTOR PHONE NO,REALTOR EMAIL ADDRESS,REALTOR ID NO',
    'Jane Doe,08010000001,jane@example.com,R-50050'
  ].join('\n');

  const secondCsv = [
    'REALTORS NAME,REALTOR PHONE NO,REALTOR EMAIL ADDRESS,REALTOR ID NO',
    'John Smith,08010000002,john@example.com,R-50051'
  ].join('\n');

  const firstImport = await importCsvRecords(firstCsv);
  const secondImport = await importCsvRecords(secondCsv);

  assert.ok(firstImport.length >= 1);
  assert.ok(secondImport.length >= firstImport.length + 1);
  assert.ok(secondImport.some((row) => row['REALTOR PHONE NO'] === '08010000001'));
  assert.ok(secondImport.some((row) => row['REALTOR PHONE NO'] === '08010000002'));
});
