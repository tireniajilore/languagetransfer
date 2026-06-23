import { validateCognatesCourse } from '../src/data/cognates/adapter';

const summary = validateCognatesCourse();
const promptCount = summary.lessons.reduce((total, lesson) => total + lesson.promptCount, 0);
const sectionCount = summary.lessons.reduce((total, lesson) => total + lesson.sectionCount, 0);

console.log(`Validated ${summary.lessons.length} cognates lessons, ${sectionCount} sections, ${promptCount} prompts.`);
