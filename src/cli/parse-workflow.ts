import { parseDocument, isMap } from 'yaml';

export interface WorkflowInput {
  name: string;
  description: string;
  type: 'choice' | 'boolean' | 'string' | 'number';
  required: boolean;
  default?: string;
  options?: string[];
}

export function extractWorkflowInputs(source: string): WorkflowInput[] {
  const node = parseInputsNode(source);
  const inputs = node.items.map(({ key, value }) => parseInput(String(key), value));
  validateReleaseInputs(inputs);
  return inputs;
}

function parseInputsNode(source: string) {
  const document = parseDocument(source);
  if (document.errors.length) throw new Error(`Invalid workflow YAML: ${document.errors[0].message}`);
  const on = document.get('on');
  if (!isMap(on) || !on.has('workflow_dispatch')) throw new Error('Workflow must declare workflow_dispatch inputs.');
  const node = document.getIn(['on', 'workflow_dispatch', 'inputs']);
  if (!isMap(node)) throw new Error('Workflow must declare channel and version inputs.');
  return node;
}

function parseInput(name: string, value: unknown): WorkflowInput {
  if (!isMap(value)) throw new Error(`Invalid input: ${name}`);
  const config = value.toJSON();
  const type = parseInputType(name, config.type ?? 'string');
  if (type === 'choice') validateChoiceOptions(name, config.options);
  return {
    name,
    description: config.description || name,
    type,
    required: config.required === true,
    default: config.default === undefined ? undefined : String(config.default),
    options: config.options,
  };
}

function parseInputType(name: string, type: unknown): WorkflowInput['type'] {
  switch (type) {
    case 'choice':
    case 'boolean':
    case 'string':
    case 'number':
      return type;
    default:
      throw new Error(`Unsupported input type for ${name}: ${type}`);
  }
}

function validateChoiceOptions(name: string, options: unknown) {
  if (!Array.isArray(options) || !options.length || options.some(value => typeof value !== 'string')) {
    throw new Error(`Input ${name} must have string options.`);
  }
}

function validateReleaseInputs(inputs: WorkflowInput[]) {
  const channel = inputs.findIndex(i => i.name === 'channel');
  const version = inputs.findIndex(i => i.name === 'version');
  if (channel < 0 || version < 0 || channel > version || inputs[version].type !== 'choice') {
    throw new Error('Declare channel before a version choice input to enable version previews.');
  }
}
