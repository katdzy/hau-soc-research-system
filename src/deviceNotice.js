/**
 * What a device notification says (Figma PWA-12, "Lock screen — a general
 * message; details only after signing in"). It mirrors an outbox email but
 * never carries its subject or body, so a verdict or a return is not readable
 * on a locked phone; tapping it opens the project, behind sign-in.
 *
 * functions/index.js (sendPush) keeps a copy of this text: the Cloud Function
 * is deployed on its own and cannot import from src/.
 */
export const NOTICE_TITLE = 'HAU-SOC Capstone'

export function lockScreenText(mail) {
  return {
    title: NOTICE_TITLE,
    body: mail?.projectId ? 'Update on your capstone project' : 'Update on your account',
  }
}
