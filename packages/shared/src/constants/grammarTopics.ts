/**
 * The closed taxonomy of grammar topics.
 *
 * Every stored mistake must carry one of these ids. The model is given this
 * enum in its structured-output schema, which is what stops the weakness
 * ledger from filling with free-text topic names that never group together
 * ("past tense", "Past Simple", "irregular past"…).
 */

export const GRAMMAR_TOPICS = [
  'PRESENT_SIMPLE',
  'PRESENT_CONTINUOUS',
  'PAST_SIMPLE',
  'PAST_SIMPLE_IRREGULAR',
  'PAST_CONTINUOUS',
  'PRESENT_PERFECT',
  'PAST_PERFECT',
  'FUTURE_FORMS',
  'MODALS',
  'CONDITIONALS',
  'PASSIVE_VOICE',
  'REPORTED_SPEECH',
  'ARTICLES',
  'COUNTABLE_UNCOUNTABLE',
  'QUANTIFIERS',
  'PREPOSITIONS',
  'WORD_ORDER',
  'QUESTION_FORMS',
  'COMPARATIVES_SUPERLATIVES',
  'PRONOUNS',
  'SUBJECT_VERB_AGREEMENT',
  'GERUND_INFINITIVE',
  'PHRASAL_VERBS',
  'COLLOCATION',
  'VOCABULARY_CHOICE',
  'SPELLING',
  'PUNCTUATION',
  'REGISTER',
] as const;

export type GrammarTopic = (typeof GRAMMAR_TOPICS)[number];

/** Human labels for the UI. Never sent to the model — it only sees the ids. */
export const TOPIC_LABEL: Record<GrammarTopic, string> = {
  PRESENT_SIMPLE: 'Present Simple',
  PRESENT_CONTINUOUS: 'Present Continuous',
  PAST_SIMPLE: 'Past Simple',
  PAST_SIMPLE_IRREGULAR: 'Past Simple · irregular verbs',
  PAST_CONTINUOUS: 'Past Continuous',
  PRESENT_PERFECT: 'Present Perfect',
  PAST_PERFECT: 'Past Perfect',
  FUTURE_FORMS: 'Future forms',
  MODALS: 'Modal verbs',
  CONDITIONALS: 'Conditionals',
  PASSIVE_VOICE: 'Passive voice',
  REPORTED_SPEECH: 'Reported speech',
  ARTICLES: 'Articles (a / an / the)',
  COUNTABLE_UNCOUNTABLE: 'Countable & uncountable',
  QUANTIFIERS: 'Much / many / some / any',
  PREPOSITIONS: 'Prepositions',
  WORD_ORDER: 'Word order',
  QUESTION_FORMS: 'Question forms',
  COMPARATIVES_SUPERLATIVES: 'Comparatives & superlatives',
  PRONOUNS: 'Pronouns',
  SUBJECT_VERB_AGREEMENT: 'Subject–verb agreement',
  GERUND_INFINITIVE: 'Gerund & infinitive',
  PHRASAL_VERBS: 'Phrasal verbs',
  COLLOCATION: 'Collocation',
  VOCABULARY_CHOICE: 'Word choice',
  SPELLING: 'Spelling',
  PUNCTUATION: 'Punctuation',
  REGISTER: 'Register & tone',
};

export const SKILLS = [
  'grammar',
  'vocabulary',
  'speaking',
  'listening',
  'reading',
  'writing',
] as const;
export type Skill = (typeof SKILLS)[number];
