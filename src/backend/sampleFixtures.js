// The dummy PDFs behind sampleFiles.js. Its own module so a production build,
// which never imports it, ships none of them (~19 MB).
export const FIXTURES = import.meta.glob(
  ['/test-fixtures/dummy-documents/**/*.pdf', '!**/*FM-AAC-SOC*', '!**/*ApprovalSheet*'],
  { query: '?url', import: 'default' },
)
