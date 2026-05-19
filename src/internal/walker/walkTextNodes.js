const MAX_TEXT_LENGTH = 1024 * 1024;

function shouldInclude(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function pushNode(nodes, holder, key, path) {
  const value = holder?.[key];
  if (!shouldInclude(value)) return;
  nodes.push({
    path,
    value,
    set(nextValue) {
      holder[key] = nextValue;
      this.value = nextValue;
    },
  });
}

function walkStringOrTextBlocks(nodes, holder, key, path) {
  const value = holder?.[key];
  if (typeof value === "string") {
    pushNode(nodes, holder, key, path);
    return;
  }
  if (!Array.isArray(value)) return;
  for (let i = 0; i < value.length; i++) {
    const block = value[i];
    if (!block || typeof block !== "object") continue;
    if (!block.type || block.type === "text" || Object.prototype.hasOwnProperty.call(block, "text")) {
      pushNode(nodes, block, "text", `${path}[${i}].text`);
    }
  }
}

function walkOpenAiChat(nodes, body) {
  pushNode(nodes, body, "system", "system");
  if (Array.isArray(body?.messages)) {
    for (let i = 0; i < body.messages.length; i++) {
      walkStringOrTextBlocks(nodes, body.messages[i], "content", `messages[${i}].content`);
    }
  }
  walkTools(nodes, body?.tools, "tools");
}

function walkClaude(nodes, body) {
  walkStringOrTextBlocks(nodes, body, "system", "system");
  if (Array.isArray(body?.messages)) {
    for (let i = 0; i < body.messages.length; i++) {
      walkStringOrTextBlocks(nodes, body.messages[i], "content", `messages[${i}].content`);
    }
  }
  walkTools(nodes, body?.tools, "tools");
}

function walkResponses(nodes, body) {
  pushNode(nodes, body, "instructions", "instructions");
  const input = body?.input;
  if (typeof input === "string") {
    pushNode(nodes, body, "input", "input");
    return;
  }
  if (!Array.isArray(input)) return;
  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    if (!item || typeof item !== "object") continue;
    walkStringOrTextBlocks(nodes, item, "content", `input[${i}].content`);
    pushNode(nodes, item, "output", `input[${i}].output`);
  }
}

function walkGemini(nodes, body) {
  if (typeof body?.system_instruction === "string") {
    pushNode(nodes, body, "system_instruction", "system_instruction");
  } else if (Array.isArray(body?.system_instruction?.parts)) {
    walkParts(nodes, body.system_instruction.parts, "system_instruction.parts");
  }
  if (Array.isArray(body?.contents)) {
    for (let i = 0; i < body.contents.length; i++) {
      walkParts(nodes, body.contents[i]?.parts, `contents[${i}].parts`);
    }
  }
  if (Array.isArray(body?.tools)) {
    for (let i = 0; i < body.tools.length; i++) {
      const declarations = body.tools[i]?.function_declarations;
      if (!Array.isArray(declarations)) continue;
      for (let j = 0; j < declarations.length; j++) {
        pushNode(nodes, declarations[j], "description", `tools[${i}].function_declarations[${j}].description`);
      }
    }
  }
}

function walkParts(nodes, parts, path) {
  if (!Array.isArray(parts)) return;
  for (let i = 0; i < parts.length; i++) {
    pushNode(nodes, parts[i], "text", `${path}[${i}].text`);
  }
}

function walkTools(nodes, tools, path) {
  if (!Array.isArray(tools)) return;
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    if (!tool || typeof tool !== "object") continue;
    pushNode(nodes, tool, "description", `${path}[${i}].description`);
    pushNode(nodes, tool.function, "description", `${path}[${i}].function.description`);
    walkSchemaDescriptions(nodes, tool.input_schema, `${path}[${i}].input_schema`);
    walkSchemaDescriptions(nodes, tool.function?.parameters, `${path}[${i}].function.parameters`);
  }
}

function walkSchemaDescriptions(nodes, schema, path) {
  if (!schema || typeof schema !== "object") return;
  pushNode(nodes, schema, "description", `${path}.description`);
  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, prop] of Object.entries(schema.properties)) {
      walkSchemaDescriptions(nodes, prop, `${path}.properties.${key}`);
    }
  }
  if (Array.isArray(schema.anyOf)) schema.anyOf.forEach((s, i) => walkSchemaDescriptions(nodes, s, `${path}.anyOf[${i}]`));
  if (Array.isArray(schema.oneOf)) schema.oneOf.forEach((s, i) => walkSchemaDescriptions(nodes, s, `${path}.oneOf[${i}]`));
  if (Array.isArray(schema.allOf)) schema.allOf.forEach((s, i) => walkSchemaDescriptions(nodes, s, `${path}.allOf[${i}]`));
  walkSchemaDescriptions(nodes, schema.items, `${path}.items`);
}

function normalizeFormat(format = "") {
  return String(format).toLowerCase();
}

export function walkTextNodes(body, format) {
  const nodes = [];
  const normalized = normalizeFormat(format);
  if (!body || typeof body !== "object") return nodes;

  if (normalized.includes("gemini") || normalized.includes("vertex")) {
    walkGemini(nodes, body);
  } else if (normalized.includes("response")) {
    walkResponses(nodes, body);
  } else if (normalized.includes("claude") || normalized.includes("anthropic")) {
    walkClaude(nodes, body);
  } else {
    walkOpenAiChat(nodes, body);
  }

  return nodes;
}

export default walkTextNodes;
