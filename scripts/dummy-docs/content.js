// Project-specific text for the dummy documents. Every name, number and
// reference is a placeholder; the structure follows the SOC Research Manual
// (May 2025) — IT and CS method sections differ — and the WD402 Group 05
// proposal manuscript's appendices.
//
// Each project gives: topics (S3.1), concept paper parts (S3.5), the proposal
// chapters (S4–S5), the Capstone 2 results (S6–S7), the panel's revision items
// (FM-AAC-SOC-2004) and how the group complied with them.

export const PROJECTS = {
  p_g1: {
    title: 'Thesis Adviser Consultation Scheduler',
    short: 'the Consultation Scheduler',
    host: { office: 'School of Computing Faculty Room', head: 'The Program Chair/Coordinator', salutation: 'Dear Sir/Madam:' },
    topics: [
      ['Thesis Adviser Consultation Scheduler', 'A web application where capstone groups book consultation slots that their adviser publishes, with reminders and a shared consultation history.'],
      ['Campus Lost-and-Found Tracker', 'A portal where the security office logs found items and students claim them with photo matching and claim codes.'],
      ['Room Reservation System for Student Organizations', 'Online booking of function rooms with approval routing to the Office of Student Affairs.'],
      ['Library Seat Availability Monitor', 'A live map of free study seats built from check-in QR codes at each table.'],
      ['Alumni Tracer Survey Portal', 'An online tracer study that alumni answer from an emailed link, with program-level dashboards.'],
    ],
    background: [
      'Capstone groups meet their advisers weekly, yet most consultations are arranged through group chats and personal messages. Advisers who handle several groups receive overlapping requests, meetings are missed when a message is buried, and neither side keeps a reliable record of what was agreed.',
      'A scheduler that lets the adviser publish available slots and lets each group book one would remove the back-and-forth, remind both sides before the meeting, and keep a short record of every consultation that the group can refer to when it revises its work.',
    ],
    problem: 'Consultation requests arrive through several channels, meetings are double-booked or forgotten, and no shared record of consultations exists.',
    general: 'develop and evaluate a web-based consultation scheduler for capstone groups and their advisers',
    objectives: [
      'analyze how capstone consultations are currently requested, scheduled and recorded, and identify the problems;',
      'design and develop a system in which advisers publish consultation slots and groups book, cancel and reschedule them;',
      'send email reminders to the group and the adviser one day and one hour before each consultation;',
      'keep a consultation record with the topics discussed and the agreed next steps, exportable per group; and',
      'evaluate the system using ISO/IEC 25010 and the System Usability Scale.',
    ],
    scope: [
      'The system covers consultations between capstone groups and their advisers in the School of Computing. Advisers publish weekly availability; a group may hold one upcoming booking per adviser at a time. Reminders are sent by email only.',
      'The study does not cover grading, class scheduling or video conferencing; meetings take place face to face or on the university’s existing video platform, whose link the adviser adds to the slot.',
    ],
    rrl: [
      ['Appointment Scheduling in Higher Education', 'Studies of online appointment systems for advising offices report fewer missed meetings once students choose from published slots instead of requesting times by message (Placeholder & Author, 2023). The main design lesson is that availability must be owned by the adviser and visible to every group at once.'],
      ['Reminder Timing and Attendance', 'Reminders sent a day and an hour before an appointment reduce no-shows more than a single reminder (Sample, 2022). Email is adequate for a university audience that already reads institutional mail on their phones.'],
      ['Records of Academic Advising', 'Short structured notes after each meeting help students act on advice and help advisers see progress across weeks (Example & Writer, 2024).'],
      ['Usability Evaluation of Scheduling Tools', 'The System Usability Scale is widely used to evaluate booking tools because the tasks are short and repeated (Placeholder, 2020).'],
    ],
    ipo: {
      input: ['Current consultation practice', 'Adviser and student requirements', 'React, Firebase'],
      process: ['Requirement analysis', 'Design and development (Scrum)', 'Testing and evaluation'],
      output: ['Thesis Adviser Consultation Scheduler', 'Evaluation results'],
    },
    frs: [
      ['FR-01', 'Adviser', 'Publish and edit weekly consultation slots'],
      ['FR-02', 'Group', 'Book, cancel and reschedule a slot'],
      ['FR-03', 'System', 'Email reminders one day and one hour before a meeting'],
      ['FR-04', 'Adviser', 'Record topics and next steps after each consultation'],
      ['FR-05', 'Group', 'View and export the consultation history'],
      ['FR-06', 'Administrator', 'Manage adviser and group accounts'],
    ],
    nfrs: [
      ['Performance', 'A booking is confirmed on every open screen within two seconds'],
      ['Usability', 'A group books a slot in under one minute on its first attempt'],
      ['Security', 'Only university accounts can sign in; each group sees only its own records'],
      ['Reliability', 'Two groups can never book the same slot'],
    ],
    entities: ['ADVISER', 'GROUP', 'SLOT', 'BOOKING', 'CONSULTATION_NOTE'],
    respondents: [['Advisers', 5, 'SUS, ISO/IEC 25010'], ['Capstone students', 30, 'SUS'], ['IT experts', 5, 'ISO/IEC 25010']],
    results: {
      checklist: [['Publish slots', true], ['Book a slot', true], ['Cancel and reschedule', true], ['Email reminders', true], ['Consultation notes', true], ['Export history', true], ['Account management', true], ['No double booking', true]],
      iso: [['Functional Suitability', 4.52], ['Performance Efficiency', 4.31], ['Usability', 4.44], ['Reliability', 4.28]],
      sus: 81.5,
      extra: ['Double-booking test', 'Two groups booked the same slot 200 times in parallel; every attempt produced exactly one booking.'],
    },
    discussion: 'Advisers rated functional suitability highest, citing that published slots ended the back-and-forth over meeting times. The lowest-rated item, reliability, reflected one test session in which reminders arrived late because of the mail provider’s quota, which the group fixed by batching reminders.',
    conclusion: 'The scheduler replaced message-based scheduling for the groups who used it, prevented double bookings, and was rated above average in usability (SUS 81.5).',
    recommendations: ['Add calendar export (iCal) so advisers see bookings in their existing calendars.', 'Let advisers share one availability across all their groups.', 'Evaluate the system over a full semester instead of a four-week pilot.'],
  },

  p_g2: {
    title: 'Smart Queue Management System for University Clinics',
    short: 'the Smart Queue system',
    host: { office: 'University Health Services', head: 'The Head Nurse', salutation: 'Dear Madam:' },
    topics: [
      ['Smart Queue Management System for University Clinics', 'Patients join the clinic queue from a QR code or the portal, see their position and estimated wait, and are emailed when two turns away.'],
      ['Campus Lost-and-Found Tracker', 'A portal where the security office logs found items and students claim them with photo matching and claim codes.'],
      ['Room Reservation System for Student Organizations', 'Online booking of function rooms with approval routing to the Office of Student Affairs.'],
      ['Library Seat Availability Monitor', 'A live map of free study seats built from check-in QR codes at each table.'],
      ['Alumni Tracer Survey Portal', 'An online tracer study that alumni answer from an emailed link, with program-level dashboards.'],
    ],
    background: [
      'University clinics serve a steady stream of students, faculty and staff who arrive for consultations, medical clearances, dental check-ups and the release of laboratory results. At most campuses the arrival of these patients is still managed by a paper logbook at the reception desk and a verbal call of names once a nurse or physician is free.',
      'Digital queue management systems address this by issuing a numbered ticket, displaying the current number, and notifying the patient when their turn approaches. Commercial systems are priced and designed for large institutions; a lightweight web-based system running on the phones students already carry would suit a campus clinic better.',
    ],
    problem: 'Patients cannot see their position in line, staff are interrupted by repeated questions, urgent cases wait behind routine clearances, and the clinic cannot report service volume.',
    general: 'develop and evaluate a web-based Smart Queue Management System for the university clinic',
    objectives: [
      'analyze the current patient reception and queueing process of the clinic and identify its problems;',
      'design and develop a system that lets patients join the queue through a QR code or the university portal, view their position and estimated waiting time, and receive an email when their turn approaches;',
      'provide clinic staff with a dashboard to call, skip, recall and prioritize tickets, and to generate daily and monthly service reports;',
      'evaluate the system in terms of functional suitability, performance efficiency, usability and reliability based on ISO/IEC 25010; and',
      'measure the perceived usability of the system using the System Usability Scale.',
    ],
    scope: [
      'The system covers the queue for walk-in services of the university clinic: medical consultation, dental consultation, medical clearance and the release of results. Patients sign in with their university email address; a patient may hold one active ticket at a time.',
      'The study does not cover appointment scheduling, electronic medical records, prescriptions, billing or any clinical data beyond the service requested. Notifications are sent by email only; SMS is outside the scope because of its per-message cost.',
    ],
    rrl: [
      ['Queueing Theory and Perceived Waiting Time', 'For a single-server clinic desk, the expected waiting time grows sharply as utilization approaches one (Example & Writer, 2022). Uncertain waits feel longer than known, finite waits of the same duration (Placeholder, 2021), which supports giving every patient a live view of the queue.'],
      ['Web-Based and Mobile Queue Management Systems', 'A registrar queue built as a progressive web application reduced counter congestion by letting students wait outside and return when notified (Author et al., 2023). The proposed system adopts ticket issuance without a kiosk, a public display and staff call controls.'],
      ['Notification Channels and Response Behavior', 'Email and push notifications are nearly free to send, while SMS carries per-message costs small institutions struggle to sustain (Writer, 2022).'],
      ['Software Quality Evaluation', 'Capstone projects in the Philippines commonly ask IT experts to rate a system against ISO/IEC 25010 characteristics on a Likert scale (Example, 2023).'],
    ],
    ipo: {
      input: ['Current clinic process', 'Staff and patient requirements', 'React, Firebase'],
      process: ['Requirement analysis', 'Design and development (Scrum)', 'Testing and evaluation'],
      output: ['Smart Queue Management System for University Clinics', 'Evaluation results'],
    },
    frs: [
      ['FR-01', 'Patient', 'Sign in with a university email address'],
      ['FR-02', 'Patient', 'Join the queue by scanning a QR code or from the portal'],
      ['FR-03', 'Patient', 'View position in line and estimated waiting time'],
      ['FR-04', 'Patient', 'Receive an email when two turns away; cancel a ticket'],
      ['FR-05', 'Staff', 'Call the next ticket; skip, recall and complete tickets'],
      ['FR-06', 'Staff', 'Move a ticket to the front with a recorded reason'],
      ['FR-07', 'Administrator', 'Generate daily and monthly reports'],
    ],
    nfrs: [
      ['Performance', 'Queue updates reach every open screen within two seconds'],
      ['Usability', 'A first-time patient can join the queue in under one minute'],
      ['Security', 'Only university email addresses can sign in; staff actions are logged'],
      ['Reliability', 'Tickets survive a page refresh or a lost connection'],
    ],
    entities: ['PATIENT', 'SERVICE', 'TICKET', 'STAFF', 'STAFF_ACTION'],
    respondents: [['Clinic staff', 5, 'SUS, ISO/IEC 25010'], ['Student patients', 30, 'SUS'], ['Faculty and employee patients', 10, 'SUS'], ['IT experts', 5, 'ISO/IEC 25010']],
    results: {
      checklist: [['Sign in with a university email', true], ['Join a queue by QR code', true], ['View position and estimate', true], ['Email two turns away', true], ['Call next ticket', true], ['Skip and recall', true], ['Prioritize with a reason', true], ['Public display updates', true], ['Daily report', true], ['Monthly report', true]],
      iso: [['Functional Suitability', 4.61], ['Performance Efficiency', 4.38], ['Usability', 4.55], ['Reliability', 4.40]],
      sus: 84.0,
      extra: ['Simulated morning', 'Average waiting time fell from 41 to 26 minutes in the simulated session; no patient left before being served.'],
    },
    discussion: 'Clinic staff valued the priority control most; it let them serve urgent cases without arguments at the desk. Students rated the estimated waiting time as the most useful patient feature, although several noted that the estimate jumps when staff take a break, which the group addressed by showing a range instead of a single number.',
    conclusion: 'The Smart Queue system made the clinic queue visible to patients and staff, reduced waiting time in the simulated session, and was rated excellent in usability (SUS 84.0).',
    recommendations: ['Add a text-to-speech call on the public display.', 'Integrate with the clinic’s appointment calendar once one exists.', 'Pilot the system during the annual physical examination period.'],
  },

  p_g3: {
    title: 'IoT-Based Laboratory Equipment Tracking for Computing Laboratories',
    short: 'the equipment tracker',
    host: { office: 'Computing Laboratories Office', head: 'The Laboratory Supervisor', salutation: 'Dear Sir:' },
    topics: [
      ['IoT-Based Laboratory Equipment Tracking for Computing Laboratories', 'BLE tags on laboratory equipment and gateways in each room report where every item is, with alerts when an item leaves its room.'],
      ['Campus Lost-and-Found Tracker', 'A portal where the security office logs found items and students claim them with photo matching and claim codes.'],
      ['Room Reservation System for Student Organizations', 'Online booking of function rooms with approval routing to the Office of Student Affairs.'],
      ['Library Seat Availability Monitor', 'A live map of free study seats built from check-in QR codes at each table.'],
      ['Alumni Tracer Survey Portal', 'An online tracer study that alumni answer from an emailed link, with program-level dashboards.'],
    ],
    background: [
      'The computing laboratories lend projectors, development boards, networking kits and spare peripherals to classes every day. Borrowing is recorded on paper, items are moved between rooms without a record, and the semestral inventory regularly finds equipment missing or in the wrong room.',
      'Bluetooth Low Energy (BLE) tags are inexpensive and last months on a coin cell. Gateways in each room can detect the tags and report their signal strength, from which a server can estimate the room an item is in. Combined with a borrowing log, such a system would show where every item is and flag items that leave the laboratories.',
    ],
    problem: 'Laboratory staff cannot locate equipment without searching every room, borrowing records are incomplete, and losses are discovered only at inventory time.',
    general: 'design, build and evaluate an IoT system that locates tagged laboratory equipment by room and records its movement',
    objectives: [
      'determine the equipment-handling problems of the computing laboratories through observation and interviews;',
      'design a BLE tag and gateway network and a room-level location algorithm based on received signal strength;',
      'develop a web dashboard that shows the location and movement history of each item and alerts staff when an item leaves the laboratories;',
      'measure the room-level location accuracy of the algorithm in the four computing laboratories; and',
      'evaluate the system using ISO/IEC 25010 with laboratory staff and IT experts.',
    ],
    scope: [
      'The study covers the four computing laboratories and the equipment room on one floor, using BLE tags on 60 items and one gateway per room. Location is resolved to the room, not to a position within it.',
      'The study does not track people, does not cover equipment outside the floor, and does not replace the university’s property inventory system; it provides location and movement records that staff can reconcile with it.',
    ],
    rrl: [
      ['Indoor Positioning with Bluetooth Low Energy', 'RSSI-based room-level positioning with one receiver per room achieves over 90% accuracy when readings are smoothed over a short window (Placeholder & Author, 2023).'],
      ['Asset Tracking in Educational Laboratories', 'Tagged asset systems in school laboratories reduced search time and made borrowing records complete (Sample, 2024).'],
      ['Signal Smoothing and Classification', 'Moving averages and Kalman filters reduce RSSI noise; a nearest-gateway rule with hysteresis prevents items from flickering between rooms (Example & Writer, 2022).'],
      ['Evaluating IoT Systems', 'ISO/IEC 25010 is commonly applied to IoT prototypes alongside accuracy measurements of the sensing layer (Example, 2023).'],
    ],
    ipo: {
      input: ['Laboratory equipment handling', 'Staff requirements', 'BLE tags, ESP32 gateways, Firebase'],
      process: ['Network and algorithm design', 'Development and calibration', 'Accuracy test and evaluation'],
      output: ['IoT-based equipment tracker', 'Accuracy and evaluation results'],
    },
    // CS method (Research Manual): design, data, participants, instruments, collection, analysis, procedures.
    csMethod: {
      design: 'The study uses a developmental research design with a quantitative evaluation. The location algorithm is developed iteratively and its accuracy is measured experimentally.',
      data: 'RSSI readings from 60 tagged items collected by four gateways every second for two weeks, and ground-truth room labels recorded by the researchers during 400 controlled moves.',
      participants: 'Five laboratory staff and five IT experts evaluate the system; no personal data about students is collected.',
      instruments: 'The ISO/IEC 25010 evaluation form (Appendix H) and an accuracy test log recording the true and predicted room of each move.',
      analysis: 'Accuracy is the share of moves whose predicted room matches the true room after the smoothing window. ISO/IEC 25010 ratings are summarized by weighted mean (Table 6).',
    },
    frs: [
      ['FR-01', 'Staff', 'Register an item and attach a BLE tag'],
      ['FR-02', 'System', 'Estimate the room of each tagged item every five seconds'],
      ['FR-03', 'Staff', 'View the location and movement history of an item'],
      ['FR-04', 'System', 'Alert staff when an item leaves the laboratories'],
      ['FR-05', 'Staff', 'Record borrowing and return of an item'],
      ['FR-06', 'Supervisor', 'Generate inventory and movement reports'],
    ],
    nfrs: [
      ['Accuracy', 'Room-level location is correct for at least 90% of moves'],
      ['Performance', 'A move appears on the dashboard within ten seconds'],
      ['Reliability', 'A gateway that goes offline is reported within one minute'],
      ['Security', 'Only laboratory staff accounts can view locations'],
    ],
    entities: ['ITEM', 'TAG', 'GATEWAY', 'ROOM', 'READING', 'MOVEMENT', 'BORROWING'],
    respondents: [['Laboratory staff', 5, 'ISO/IEC 25010'], ['IT experts', 5, 'ISO/IEC 25010']],
    results: {
      checklist: [['Register item and tag', true], ['Room estimate every five seconds', true], ['Location history', true], ['Out-of-laboratory alert', true], ['Borrowing and return', true], ['Inventory report', true], ['Gateway offline alert', true]],
      iso: [['Functional Suitability', 4.46], ['Performance Efficiency', 4.20], ['Usability', 4.36], ['Reliability', 4.12]],
      sus: null,
      extra: ['Location accuracy', 'Room-level accuracy was 94.3% (377 of 400 moves) with a 10-second smoothing window, and 86.8% without smoothing.'],
    },
    discussion: 'Smoothing over ten seconds raised accuracy above the 90% target at the cost of a short delay before a move appears, which staff found acceptable. Errors concentrated at the doorway between Laboratories 2 and 3, where both gateways receive similar signal strength; hysteresis reduced but did not remove these errors.',
    conclusion: 'The tracker located tagged equipment by room with 94.3% accuracy, completed the borrowing records, and was rated highly by laboratory staff and IT experts.',
    recommendations: ['Add a second gateway at shared doorways.', 'Integrate with the university property inventory to reconcile records automatically.', 'Test tag battery life over a full semester.'],
  },
}

/** The panel's required revisions (FM-AAC-SOC-2004) and the group's compliance. */
export const REVISIONS = {
  Proposal: [
    ['Tighten the scope statement: say which services are in and which are out.', 'Scope and Delimitations now lists the covered services and the exclusions in two paragraphs.', 'Scope and Delimitations'],
    ['Make objective 3 measurable.', 'Objective 3 now states the measured targets from the non-functional requirements.', 'Objectives of the Study'],
    ['Add the respondents’ selection criteria.', 'Sample and Setting now explains the purposive sampling criteria for each group.', 'Sample and Setting'],
  ],
  Final: [
    ['Add the per-item evaluation results to the Results, not only the means.', 'Results now include the full evaluation table per item.', 'Results'],
    ['Explain the lowest-rated characteristic in the Discussion.', 'Discussion now explains the cause of the lowest rating and the fix made.', 'Discussion'],
    ['Align the recommendations with the limitations found.', 'Each recommendation now answers a limitation found during testing.', 'Recommendations'],
  ],
}

export const REFERENCES = [
  'Author, A. B., Writer, C. D., & Name, E. F. (2023). A placeholder study of progressive web applications for campus services. Journal of Sample Computing, 12(3), 45–58.',
  'Example, G. (2023). Evaluating capstone systems against a software quality model: A placeholder review. Philippine Journal of Placeholder Studies, 8(1), 1–14.',
  'Example, H., & Writer, I. (2022). Models for small service systems (placeholder ed.). Sample Press.',
  'Placeholder, J. (2020). Measuring usability with a ten-item scale: A placeholder overview. Sample Usability Review, 5(2), 20–31.',
  'Placeholder, K. (2021). The psychology of waiting revisited. Placeholder Service Quarterly, 30(4), 101–115.',
  'Placeholder, L., & Author, M. (2023). Room-level positioning and scheduling in placeholder settings. Journal of Sample Operations, 3(1), 7–19.',
  'Sample, N. (2022). Reminder timing and attendance: A placeholder study. In Proceedings of the Placeholder Conference on Information Systems (pp. 88–95). Sample Publisher.',
  'Sample, O. (2024). Asset tracking in teaching laboratories. Sample Journal of Educational Technology, 2(2), 60–72.',
  'Writer, Q. (2022). Choosing notification channels for low-budget systems. Placeholder Informatics, 9(1), 33–41.',
]
