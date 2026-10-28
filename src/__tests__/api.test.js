// src/services/api.js in the Firebase build: what each call sends to the `act`
// Cloud Function, and the upload that comes before a submission.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pdfFile, otherFile } from './pdfFixture.js'
import { remoteActions } from '../services/api.js'
import * as api from '../services/api.js'
import * as actions from '../services/actions.js'
import { REMOTE, writePathOf } from '../services/remote.js'
import { DOC_TYPES as T } from '../domain/constants.js'

let sent, put, remote
const me = { id: 's_kilo' }
const allow = () => ({ isLink: false })

beforeEach(() => {
  sent = []
  put = vi.fn(async (path, _file, opts) => { opts?.onProgress?.(1); return path })
  remote = remoteActions({
    send: async (name, args) => { sent.push({ name, args }); return { id: 'new' } },
    files: { put },
    check: allow,
  })
})

describe('remoteActions', () => {
  it('sends the arguments, never the actor or the snapshot', async () => {
    await remote.submitReview(me, { users: ['whole store'] }, 'p_g1', 'd1', { decision: 'Approved' })
    await remote.registerAccount(null, { email: 'a@hau.edu.ph', name: 'A' })
    await remote.confirmProviderVerification('a@hau.edu.ph')
    expect(sent).toEqual([
      { name: 'submitReview', args: ['p_g1', 'd1', { decision: 'Approved' }] },
      { name: 'registerAccount', args: [{ email: 'a@hau.edu.ph', name: 'A' }] },
      { name: 'confirmProviderVerification', args: ['a@hau.edu.ph'] },
    ])
  })

  it('sends data only: a gate’s functions and undefined fields drop out', async () => {
    const gate = { action: 'REGISTER_TITLE', label: 'Register the title', requires: () => null, next: () => 'X' }
    await remote.runGate(me, null, 'p_g1', gate)
    await remote.scheduleDefense(me, null, 'p_g1', { at: '2026-11-02T09:00', room: undefined })
    expect(sent).toEqual([
      { name: 'runGate', args: ['p_g1', { action: 'REGISTER_TITLE', label: 'Register the title' }] },
      { name: 'scheduleDefense', args: ['p_g1', { at: '2026-11-02T09:00' }] },
    ])
  })

  it('uploads the PDF, then sends its path — not the file', async () => {
    const file = pdfFile('Chapters 1-3.pdf', 2048)
    const progress = []
    await remote.submitDocument(me, null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, file, title: 'v2', onProgress: (f) => progress.push(f) })
    expect(put).toHaveBeenCalledOnce()
    const [path, uploaded, { metadata }] = put.mock.calls[0]
    expect(uploaded).toBe(file)
    expect(path).toMatch(/^projects\/p_g1\/documents\/[a-z0-9]+-Chapters_1-3\.pdf$/)
    expect(metadata).toMatchObject({ projectId: 'p_g1', docType: T.PROPOSAL_MANUSCRIPT, uploadedBy: 's_kilo' })
    expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(sent).toEqual([{ name: 'submitDocument', args: ['p_g1', { docType: T.PROPOSAL_MANUSCRIPT, title: 'v2', storagePath: path, fileName: 'Chapters 1-3.pdf' }] }])
    expect(progress).toEqual([1])
  })

  it('uploads nothing when the submission would be refused', async () => {
    const refusing = remoteActions({
      send: async () => {}, files: { put },
      check: () => { throw new Error('Proposal Manuscript is not accepted at Topic Proposal.') },
    })
    await expect(refusing.submitDocument(me, null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, file: pdfFile() })).rejects.toThrow(/not accepted/)
    await expect(remote.submitDocument(me, null, 'p_g1', { docType: T.PROPOSAL_MANUSCRIPT, file: otherFile('x.pdf', 'application/pdf') })).rejects.toThrow(/not a PDF/)
    expect(put).not.toHaveBeenCalled()
  })

  it('a video link goes without an upload', async () => {
    remote = remoteActions({ send: async (name, args) => { sent.push({ name, args }) }, files: { put }, check: () => ({ isLink: true }) })
    await remote.submitDocument(me, null, 'p_g1', { docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/x' })
    expect(put).not.toHaveBeenCalled()
    expect(sent[0].args[1]).toEqual({ docType: T.PRESENTATION_VIDEO, link: 'https://youtu.be/x' })
  })

  it('refuses a double-click while the first call is out', async () => {
    let release
    remote = remoteActions({ send: () => new Promise(r => { release = r }), files: { put }, check: allow })
    const first = remote.runGate(me, null, 'p_g1', 'APPROVE_TOPIC')
    await expect(remote.runGate(me, null, 'p_g1', 'APPROVE_TOPIC')).rejects.toThrow(/already being processed/)
    release({ ok: true })
    await expect(first).resolves.toEqual({ ok: true })
  })
})

describe('api.js', () => {
  it('covers every remote action, and each exists in actions.js', () => {
    for (const name of Object.keys(REMOTE)) {
      expect(typeof actions[name], name).toBe('function')
      expect(typeof api[name], name).toBe('function')
    }
  })

  it('never sends verifyEmail to the server: a readable token must not verify an account there', () => {
    expect(REMOTE).not.toHaveProperty('verifyEmail')
    expect(api.verifyEmail).toBe(actions.verifyEmail)
  })

  it('is actions.js itself in the local build', () => {
    expect(api.submitDocument).toBe(actions.submitDocument)
    expect(api.runGate).toBe(actions.runGate)
  })
})

describe('writePathOf (VITE_WRITE_PATH)', () => {
  it('takes an explicit choice', () => {
    expect(writePathOf({ VITE_WRITE_PATH: 'direct', VITE_USE_EMULATORS: 'true' })).toBe('direct')
    expect(writePathOf({ VITE_WRITE_PATH: ' functions ' })).toBe('functions')
  })

  it('defaults to functions on the emulators and direct on a live project', () => {
    expect(writePathOf({ VITE_USE_EMULATORS: 'true' })).toBe('functions')
    expect(writePathOf({ VITE_USE_EMULATORS: 'false' })).toBe('direct')
    expect(writePathOf({})).toBe('direct')
  })

  it('ignores a value it does not know, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(writePathOf({ VITE_WRITE_PATH: 'server', VITE_USE_EMULATORS: 'true' })).toBe('functions')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('is local outside the Firebase build', () => {
    expect(api.writePath).toBe('local')
  })
})
