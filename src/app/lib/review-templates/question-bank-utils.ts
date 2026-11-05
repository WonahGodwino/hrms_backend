import { QuestionType } from "@prisma/client";

export const VALID_QUESTION_TYPES: QuestionType[] = [
  "RATING_SCALE",
  "TEXT",
  "MULTIPLE_CHOICE",
  "COMPETENCY_RATING",
  "GOAL_ASSESSMENT",
];
