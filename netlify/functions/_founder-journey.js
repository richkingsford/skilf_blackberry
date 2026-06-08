const DEFAULT_JOURNEY_STEPS = [
  {
    id: "submit-application",
    title: "Submit application",
    detail: "Done. You are now an applicant.",
    defaultDone: true,
  },
  {
    id: "unpaid-internship-attempt",
    title: "Make an honest attempt to win an unpaid internship",
    detail: "Apply to at least 40 unpaid internships and keep the evidence list.",
    defaultDone: false,
  },
  {
    id: "business-plan-company",
    title: "Write a business plan and found your own company",
    detail: "Name the company, the customer, the problem, and the first measurable proof.",
    defaultDone: false,
  },
  {
    id: "board-approval-plan",
    title: "Board approval for your 6-20 week plan",
    detail: "Get the plan approved before the official build clock starts.",
    defaultDone: false,
  },
  {
    id: "choose-founder-problem",
    title: "Choose the problem you will be judged on",
    detail: "Pick one painful problem and one target user narrow enough to prove progress.",
    defaultDone: false,
  },
  {
    id: "draft-week-plan",
    title: "Draft the weekly execution plan",
    detail: "Break the 6-20 week plan into weekly deliverables, risks, and review evidence.",
    defaultDone: false,
  },
  {
    id: "recruit-mentor",
    title: "Recruit a mentor or reviewer",
    detail: "Find one person who can challenge your claims before the board does.",
    defaultDone: false,
  },
  {
    id: "build-first-proof",
    title: "Build the first working proof",
    detail: "Produce a real artifact, not a pitch deck: demo, prototype, workflow, customer test, or measured result.",
    defaultDone: false,
  },
  {
    id: "publish-evidence-log",
    title: "Publish a dated evidence log",
    detail: "Keep links to applications, experiments, failures, demos, user feedback, and weekly outcomes.",
    defaultDone: false,
  },
  {
    id: "check-in-one",
    title: "Pass check-in #1",
    detail: "Show the board what changed, what failed, and what the next proof must demonstrate.",
    defaultDone: false,
  },
  {
    id: "check-in-two",
    title: "Pass check-in #2",
    detail: "Use reviewer feedback to tighten the evidence and unblock mentor status.",
    defaultDone: false,
  },
  {
    id: "check-in-three",
    title: "Pass check-in #3",
    detail: "Show repeatable progress and expose the hardest remaining weakness.",
    defaultDone: false,
  },
  {
    id: "check-in-four",
    title: "Pass check-in #4",
    detail: "Clear the Demo Day scheduling gate with enough proof to defend under challenge.",
    defaultDone: false,
  },
  {
    id: "demo-day-readiness",
    title: "Prepare Demo Day defense materials",
    detail: "Package the build, evidence links, raw proof, and a five-minute defense script.",
    defaultDone: false,
  },
  {
    id: "demo-day-defense",
    title: "Complete Demo Day board defense",
    detail: "Defend the work live and answer the board's strongest objections.",
    defaultDone: false,
  },
  {
    id: "share-credential",
    title: "Share the credential with employers",
    detail: "Turn the earned proof into a concise employer-facing story and outreach list.",
    defaultDone: false,
  },
];

function clean(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(email) {
  return clean(email, 240).toLowerCase();
}

function emailDocId(email) {
  const normalized = normalizeEmail(email);
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 140) || "unknown";
}

function stepsFrom(input) {
  const incoming = Array.isArray(input)
    ? new Map(input.map((step) => [String(step && step.id || ""), Boolean(step && step.done)]))
    : new Map(Object.entries(input || {}).map(([id, done]) => [id, Boolean(done)]));

  return DEFAULT_JOURNEY_STEPS.map((step) => ({
    id: step.id,
    title: step.title,
    detail: step.detail,
    done: incoming.has(step.id) ? Boolean(incoming.get(step.id)) : Boolean(step.defaultDone),
  }));
}

function stepMapFrom(input) {
  return Object.fromEntries(stepsFrom(input).map((step) => [step.id, Boolean(step.done)]));
}

function defaultJourney(input = {}) {
  const email = normalizeEmail(input.email);
  return {
    email,
    name: clean(input.name, 160),
    status: "applicant",
    steps: stepsFrom(input.steps),
  };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

module.exports = {
  DEFAULT_JOURNEY_STEPS,
  clean,
  defaultJourney,
  emailDocId,
  isEmail,
  normalizeEmail,
  stepMapFrom,
  stepsFrom,
};
