// What a group is called before it has a topic (Figma S-22, S-23d): its
// section and number, "WD-401-2". Once Instructor 1 registers the approved
// topic (REGISTER_TOPIC, stages.js) the project carries that title instead.
//
// New groups store `groupNumber` and start with the code as their title
// (newProject in actions.js, spawn.js). Groups made before that carry an
// "Untitled — Group 2 (WD-401)" or "Untitled — WD-401" title; `projectName`
// shows those by their code too, numbered by when they were created.

const UNTITLED = /^Untitled\b/i
const LEGACY_NUMBER = /^Untitled\b.*?\bGroup (\d+)\b/i
const CODE = /^[A-Z]{2,4}-\d{3}-\d+$/

/** No topic title yet: blank, "Untitled …", or the group code itself. */
export const isUntitled = (p) => !p?.title?.trim() || UNTITLED.test(p.title) || CODE.test(p.title.trim())

/** Groups of one section, oldest first (the order their numbers were given in). */
const sectionGroups = (p, projects) => projects
  .filter(x => (p.sectionId ? x.sectionId === p.sectionId : x.block === p.block))
  .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) ||
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))

/** The group's number within its section, or null when it cannot be told. */
export function groupNumberOf(p, projects = []) {
  if (!p) return null
  if (Number.isInteger(p.groupNumber)) return p.groupNumber
  const legacy = LEGACY_NUMBER.exec(p.title ?? '')
  if (legacy) return Number(legacy[1])
  const code = CODE.test(p.title ?? '') ? Number(p.title.split('-').at(-1)) : null
  if (code) return code
  const i = sectionGroups(p, projects).findIndex(x => x.id === p.id)
  return i >= 0 ? i + 1 : null
}

/** "WD-401-2" (the section alone when the number cannot be told). */
export function groupCode(p, projects = []) {
  const n = groupNumberOf(p, projects)
  return n ? `${p.block}-${n}` : (p?.block ?? '')
}

/** The next free number in a section, for a new group. */
export function nextGroupNumber(sectionGroupsList = []) {
  return sectionGroupsList.reduce((max, p, i, all) => Math.max(max, groupNumberOf(p, all) ?? 0), 0) + 1
}

/** What to call a project on screen: its topic title, or its group code until it has one. */
export const projectName = (p, projects = []) => (isUntitled(p) ? groupCode(p, projects) : p.title)

/**
 * The snapshot's projects as the screens show them: an untitled group's
 * `title` reads as its code, and every project carries `groupCode`. The
 * stored records are unchanged.
 */
export function nameProjects(projects = []) {
  return projects.map(p => {
    const code = groupCode(p, projects)
    return isUntitled(p) ? { ...p, title: code, groupCode: code } : { ...p, groupCode: code }
  })
}
