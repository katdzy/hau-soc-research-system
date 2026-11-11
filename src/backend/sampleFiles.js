// Seeded and stage-built documents are records only: no one ever uploaded
// their bytes. So the viewer has something to open (and reviewers something to
// annotate), each is paired with the matching dummy PDF from
// test-fixtures/dummy-documents — the group's own set for G1–G3, G1's set for
// the NPC groups. The UI labels these as sample files.

import { DOC_TYPES } from '../domain/constants.js'
import { stageIndex } from '../domain/stages.js'

// Lazy: a fixture is fetched only when someone opens that version.
// Dev builds only: real accounts upload real files, and a production build
// would otherwise ship ~19 MB of dummy PDFs. Without them a byte-less record
// opens as "missing" in the viewer.
const fixtures = () => import.meta.env.DEV
  ? import('./sampleFixtures.js').then(m => m.FIXTURES)
  : Promise.resolve({})

const GROUP_DIR = { p_g1: 'G1', p_g2: 'G2', p_g3: 'G3' }

function fixtureName(doc) {
  const v2 = doc.versionNumber > 1
  const finalRound = doc.workflowStage && stageIndex(doc.workflowStage) >= stageIndex('FINAL_DEFENSE')
  switch (doc.docType) {
    case DOC_TYPES.TOPIC_PROPOSAL: return 'TopicProposal'
    case DOC_TYPES.CONCEPT_PAPER: return v2 ? 'ConceptPaper_v2_Revised' : 'ConceptPaper_v1'
    case DOC_TYPES.PROPOSAL_MANUSCRIPT: return v2 ? 'ProposalManuscript_v2' : 'ProposalManuscript_v1_Draft'
    case DOC_TYPES.FINAL_MANUSCRIPT: return v2 ? 'FinalManuscript_v2' : 'FinalManuscript_v1_Draft'
    case DOC_TYPES.REVISED_MANUSCRIPT: return finalRound ? 'RevisedManuscript_Final' : 'RevisedManuscript_Proposal'
    case DOC_TYPES.EDITORS_CERTIFICATE: return 'EditorsCertificate'
    case DOC_TYPES.PLAGIARISM_CERTIFICATE: return 'PlagiarismClearanceCertificate'
    case DOC_TYPES.DEPLOYMENT_INFO: return 'DeploymentInformation'
    default: return null
  }
}

/** { url, fileName } of the dummy PDF standing in for this version, or null. */
export async function sampleFileFor(doc) {
  const name = fixtureName(doc)
  if (!name) return null
  const dir = GROUP_DIR[doc.projectId] ?? 'G1'
  const FIXTURES = await fixtures()
  const key = Object.keys(FIXTURES).find(k => k.includes(`/${dir}/`) && k.endsWith(`_${name}.pdf`))
  if (!key) return null
  return { url: await FIXTURES[key](), fileName: key.split('/').pop() }
}
