import { externalGoldCsvImportService } from '../services/externalGoldCsvImport';

async function main(): Promise<void> {
  const result = await externalGoldCsvImportService.importBaseMaxXau15m();
  console.log(JSON.stringify({
    provider: result.provider,
    sourceUrl: result.sourceUrl,
    rawRows: result.rawRows,
    parsedRows: result.parsedRows,
    skippedRows: result.skippedRows,
    firstTime: result.firstTime,
    lastTime: result.lastTime,
    summary: result.summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
