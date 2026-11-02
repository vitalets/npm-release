import { select, confirm, input } from '@inquirer/prompts';
import type { WorkflowInput } from './parse-workflow.ts';

type VersionPreview = (channel: string, choice: string) => string;

export async function collectInputs(definitions: WorkflowInput[], preview: VersionPreview) {
  const answers: Record<string, string> = Object.create(null);
  for (const field of definitions) {
    answers[field.name] = await promptField(field, answers.channel, preview);
  }
  return answers;
}

function promptField(field: WorkflowInput, channel: string, preview: VersionPreview): Promise<string> {
  const message = `${field.description.replace(/:$/, '')}:`;
  switch (field.type) {
    case 'boolean': return promptBoolean(field, message);
    case 'choice': return promptChoice(field, message, channel, preview);
    default: return promptText(field, message);
  }
}

async function promptBoolean(field: WorkflowInput, message: string): Promise<string> {
  return String(await confirm({ message, default: field.default === 'true' }));
}

function promptChoice(field: WorkflowInput, message: string, channel: string, preview: VersionPreview): Promise<string> {
  const choices = field.options!
    .filter(value => value !== '' || !(field.required || field.name === 'channel'))
    .map(value => createChoiceOption(field, value, channel, preview));
  if (choices.every(choice => choice.disabled)) throw new Error(`No valid choices for ${field.name}`);
  return select({ message, choices, default: field.default });
}

function createChoiceOption(field: WorkflowInput, value: string, channel: string, preview: VersionPreview) {
  if (field.name !== 'version') return { name: value, value };
  try {
    return { name: `${value} → ${preview(channel, value)}`, value };
  } catch (error) {
    return { name: value, value, disabled: (error as Error).message };
  }
}

function promptText(field: WorkflowInput, message: string): Promise<string> {
  return input({ message, default: field.default, validate: value => validateText(field, value) });
}

function validateText(field: WorkflowInput, value: string): true | string {
  if ((field.required || field.name === 'channel') && !value.trim()) return 'A value is required';
  if (field.name === 'channel' && !/^[a-z][0-9a-z.-]*$/i.test(value)) {
    return 'Enter a valid release channel starting with a letter';
  }
  if (field.type === 'number' && value !== '' && !Number.isFinite(Number(value))) return 'Enter a number';
  return true;
}

export function confirmRelease(): Promise<boolean> { return confirm({ message: 'Confirm:', default: true }); }
