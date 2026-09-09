/**
 * Hand-built fixtures shared by the domain tests: one survey containing every
 * element variant, and twenty responses to it with deliberately round
 * distributions so the expected aggregates can be written down by hand.
 *
 * Not imported by application code. It lives beside the tests rather than in a
 * `__fixtures__` folder so that `tsc` and ESLint cover it like anything else.
 */
import { questionId, responseId, surveyId, waveGroupId } from "@/domain/ids";
import type { ResponseId } from "@/domain/ids";
import type { AnswerValue } from "@/domain/answer";
import { authorSurvey } from "@/domain/localize";
import type { AuthoredSurvey, Survey } from "@/domain/survey";
import type {
    AnswerableQuestion,
    DropdownQuestion,
    LongTextQuestion,
    MatrixSingleQuestion,
    MultiChoiceQuestion,
    NpsQuestion,
    OpinionScaleQuestion,
    ShortTextQuestion,
    SingleChoiceQuestion,
    StatementElement,
    SurveyElement
} from "@/domain/question";

export const SURVEY_ID = surveyId("11111111-1111-4111-8111-111111111111");
export const WAVE_GROUP_ID = waveGroupId(
    "22222222-2222-4222-8222-222222222222"
);

const qid = (n: number) =>
    questionId(`33333333-3333-4333-8333-${String(n).padStart(12, "0")}`);

export const Q = {
    intro: qid(1),
    role: qid(2),
    channels: qid(3),
    country: qid(4),
    city: qid(5),
    feedback: qid(6),
    satisfaction: qid(7),
    recommend: qid(8),
    teamRatings: qid(9)
} as const;

export const statement: StatementElement = {
    type: "statement",
    isAnswerable: false,
    id: Q.intro,
    key: "intro",
    title: "Thanks for taking part",
    description: "This survey takes about three minutes."
};

export const singleChoice: SingleChoiceQuestion = {
    type: "single_choice",
    isAnswerable: true,
    id: Q.role,
    key: "role",
    title: "What is your role?",
    required: true,
    allowOther: true,
    otherLabel: "Other",
    options: [
        { value: "dev", label: "Developer" },
        { value: "design", label: "Designer" },
        { value: "pm", label: "Product manager" }
    ]
};

export const multiChoice: MultiChoiceQuestion = {
    type: "multi_choice",
    isAnswerable: true,
    id: Q.channels,
    key: "channels",
    title: "Which channels do you use?",
    required: true,
    allowOther: false,
    minSelections: 2,
    maxSelections: 3,
    options: [
        { value: "email", label: "Email" },
        { value: "slack", label: "Slack" },
        { value: "phone", label: "Phone" },
        { value: "in_person", label: "In person" }
    ]
};

export const dropdown: DropdownQuestion = {
    type: "dropdown",
    isAnswerable: true,
    id: Q.country,
    key: "country",
    title: "Where are you based?",
    required: true,
    options: [
        { value: "ee", label: "Estonia" },
        { value: "fi", label: "Finland" },
        { value: "se", label: "Sweden" }
    ]
};

export const shortText: ShortTextQuestion = {
    type: "short_text",
    isAnswerable: true,
    id: Q.city,
    key: "city",
    title: "Which city?",
    required: false,
    maxLength: 50
};

export const longText: LongTextQuestion = {
    type: "long_text",
    isAnswerable: true,
    id: Q.feedback,
    key: "feedback",
    title: "Anything else you would like to tell us?",
    required: false
};

export const opinionScale: OpinionScaleQuestion = {
    type: "opinion_scale",
    isAnswerable: true,
    id: Q.satisfaction,
    key: "satisfaction",
    title: "How satisfied are you?",
    required: true,
    max: 5,
    minLabel: "Not at all",
    maxLabel: "Very"
};

export const nps: NpsQuestion = {
    type: "nps",
    isAnswerable: true,
    id: Q.recommend,
    key: "recommend",
    title: "How likely are you to recommend us?",
    required: true
};

export const matrixSingle: MatrixSingleQuestion = {
    type: "matrix_single",
    isAnswerable: true,
    id: Q.teamRatings,
    key: "team_ratings",
    title: "Rate the team",
    required: true,
    rows: [
        { value: "speed", label: "Speed" },
        { value: "quality", label: "Quality" }
    ],
    columns: [
        { value: "low", label: "Low" },
        { value: "mid", label: "Medium" },
        { value: "high", label: "High" }
    ]
};

/** Every element variant, in runner order. */
export const ALL_ELEMENTS: readonly SurveyElement[] = [
    statement,
    singleChoice,
    multiChoice,
    dropdown,
    shortText,
    longText,
    opinionScale,
    nps,
    matrixSingle
];

/** The eight answerable variants, for tests that iterate the answer schemas. */
export const ALL_QUESTIONS: readonly AnswerableQuestion[] = [
    singleChoice,
    multiChoice,
    dropdown,
    shortText,
    longText,
    opinionScale,
    nps,
    matrixSingle
];

export const survey: Survey = {
    id: SURVEY_ID,
    title: "Product feedback",
    description: "How we are doing.",
    status: "published",
    slug: "product-feedback-2026",
    locale: "et",
    waveGroupId: WAVE_GROUP_ID,
    waveLabel: "2026",
    elements: [...ALL_ELEMENTS]
};

/**
 * The same survey as it is stored: authored in Estonian and translated into
 * nothing, which is what every survey built before Phase 12 looks like after
 * the migration.
 */
export const authoredSurvey: AuthoredSurvey = authorSurvey(survey);

// --- Twenty responses -------------------------------------------------------
//
// Row i of every array below belongs to respondent i. The distributions are
// deliberately round so the expected aggregates can be written out by hand.

const single = (value: string, other?: string): AnswerValue =>
    other === undefined
        ? { type: "single_choice", value }
        : { type: "single_choice", value, other };
const multi = (...values: string[]): AnswerValue => ({
    type: "multi_choice",
    values
});
const drop = (value: string): AnswerValue => ({ type: "dropdown", value });
const short = (value: string): AnswerValue => ({ type: "short_text", value });
const long = (value: string): AnswerValue => ({ type: "long_text", value });
const scale = (value: number): AnswerValue => ({
    type: "opinion_scale",
    value
});
const recommendation = (value: number): AnswerValue => ({ type: "nps", value });
const matrix = (values: Record<string, string>): AnswerValue => ({
    type: "matrix_single",
    values
});

const times = <T>(count: number, make: (index: number) => T): T[] =>
    Array.from({ length: count }, (_, index) => make(index));

// 10 developers, 5 designers, 3 product managers, 2 free-text others.
const roleAnswers: readonly (AnswerValue | null)[] = [
    ...times(10, () => single("dev")),
    ...times(5, () => single("design")),
    ...times(3, () => single("pm")),
    single("__other__", "Student"),
    single("__other__", "Founder")
];

// email 20, slack 15, phone 5, in_person 5 — everyone picks two or three.
const channelAnswers: readonly (AnswerValue | null)[] = [
    ...times(10, () => multi("email", "slack")),
    ...times(5, () => multi("email", "phone")),
    ...times(5, () => multi("email", "slack", "in_person"))
];

const countryAnswers: readonly (AnswerValue | null)[] = [
    ...times(12, () => drop("ee")),
    ...times(5, () => drop("fi")),
    ...times(3, () => drop("se"))
];

// Optional: 15 answered, the last 5 skipped.
const cityAnswers: readonly (AnswerValue | null)[] = [
    ...times(8, () => short("Tallinn")),
    ...times(4, () => short("Tartu")),
    ...times(3, () => short("Narva")),
    ...times(5, () => null)
];

const feedbackAnswers: readonly (AnswerValue | null)[] = [
    long("Great tool."),
    long("Needs a dark mode."),
    long("Fast and simple."),
    long("More question types please."),
    ...times(16, () => null)
];

// 1x1, 2x2, 5x3, 6x4, 6x5 -> sum 74, mean 3.7, median 4.
const satisfactionAnswers: readonly (AnswerValue | null)[] = [
    1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5
].map(scale);

// 5 detractors (0, 3, 3, 6, 6), 5 passives (7, 7, 7, 8, 8), 10 promoters.
// NPS = 50% - 25% = 25. Sum 150 -> mean 7.5, median 8.5.
const npsAnswers: readonly (AnswerValue | null)[] = [
    0, 3, 3, 6, 6, 7, 7, 7, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10
].map(recommendation);

// speed: low x4, mid x6, high x10.  quality: low x2, mid x8, high x10.
const matrixAnswers: readonly (AnswerValue | null)[] = times(20, i =>
    matrix({
        speed: i < 4 ? "low" : i < 10 ? "mid" : "high",
        quality: i < 2 ? "low" : i < 10 ? "mid" : "high"
    })
);

export type ResponseFixture = {
    readonly id: ResponseId;
    readonly answers: Readonly<Record<string, AnswerValue | null>>;
};

export const ANSWERS_BY_KEY: Readonly<
    Record<string, readonly (AnswerValue | null)[]>
> = {
    role: roleAnswers,
    channels: channelAnswers,
    country: countryAnswers,
    city: cityAnswers,
    feedback: feedbackAnswers,
    satisfaction: satisfactionAnswers,
    recommend: npsAnswers,
    team_ratings: matrixAnswers
};

export const RESPONSES: readonly ResponseFixture[] = Array.from(
    { length: 20 },
    (_, i) => ({
        id: responseId(
            `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`
        ),
        answers: Object.fromEntries(
            Object.entries(ANSWERS_BY_KEY).map(([key, values]) => [
                key,
                values[i] ?? null
            ])
        )
    })
);

/** Answers to one question, in response order. Throws if the key is unknown. */
export function answersFor(
    question: AnswerableQuestion
): readonly (AnswerValue | null)[] {
    return must(
        ANSWERS_BY_KEY[question.key],
        `no fixture answers for "${question.key}"`
    );
}

/** Narrows away `undefined` from lookups so tests can stay free of `!`. */
export function must<T>(value: T | undefined | null, what: string): T {
    if (value === undefined || value === null) throw new Error(what);
    return value;
}
