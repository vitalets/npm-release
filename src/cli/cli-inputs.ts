/**
 * Collects release workflow inputs and confirms the release interactively.
 */
import { select, confirm, input } from '@inquirer/prompts';
import type { WorkflowInput } from './parse-workflow.ts';

type VersionPreview = (channel: string, choice: string) => string;

/**
 * Prompts for workflow inputs, using an explicit channel when supplied.
 */
export async function collectInputs(
  definitions: WorkflowInput[], preview: VersionPreview, channel?: string, prompt = promptField,
) {
  if (channel !== undefined) validateChannel(definitions, channel);
  const answers: Record<string, string> = Object.create(null);
  for (const field of definitions) {
    answers[field.name] = field.name === 'channel' && channel !== undefined
      ? channel
      : await prompt(field, answers.channel, preview);
  }
  return answers;
}

/**
 * Asks for final approval before dispatching the release.
 */
export async function confirmRelease() {
  return confirm({ message: 'Confirm:', default: true });
}

function validateChannel(definitions: WorkflowInput[], channel: string) {
  const field = definitions.find(field => field.name === 'channel');
  if (!field) throw new Error('Workflow must declare a channel input');
  const validation = validateText(field, channel);
  if (validation !== true) throw new Error(`Invalid --channel: ${validation}`);
  if (field.type === 'choice' && !field.options!.includes(channel)) {
    throw new Error(`Invalid --channel: choose one of ${field.options!.filter(Boolean).join(', ')}`);
  }
  if (field.type !== 'choice' && field.type !== 'string') {
    throw new Error('--channel requires a choice or string workflow input');
  }
}

function promptField(field: WorkflowInput, channel: string, preview: VersionPreview) {
  const message = `${field.description.replace(/:$/, '')}:`;
  switch (field.type) {
    case 'boolean': return promptBoolean(field, message);
    case 'choice': return promptChoice(field, message, channel, preview);
    default: return promptText(field, message);
  }
}

async function promptBoolean(field: WorkflowInput, message: string) {
  return String(await confirm({ message, default: field.default === 'true' }));
}

function promptChoice(field: WorkflowInput, message: string, channel: string, preview: VersionPreview) {
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

function promptText(field: WorkflowInput, message: string) {
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
