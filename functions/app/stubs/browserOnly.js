// Browser-only modules the service code imports, replaced in the server
// bundle (scripts/functions/build.mjs). Each is reached only on paths the
// server does not take, or fails soft: the AI summary keeps its placeholder.

// src/backend/sampleFiles.js — dummy PDFs bundled by Vite.
export const sampleFileFor = async () => null

// @google/genai — no Gemini key on the server yet.
export class GoogleGenAI {
  constructor() { throw new Error('Gemini is not configured on the server.') }
}

// pdfjs-dist — no text extraction on the server yet.
export const GlobalWorkerOptions = {}
export function getDocument() { throw new Error('PDF text extraction is not available on the server.') }
export default ''
