// interface TokenValue {
//   value: string | number;
//   type: "color" | "spacing" | "sizing" | "borderRadius" | "typography" | "other";
//   [key: string]: unknown; // Allow for dynamic keys like modeName
// }

// type TokenCategory = <any>;

interface VariablesOutput {
  [category: string]: any;
}

interface PluginMessage {
  message?: string;
}

interface Mode {
  modeId: string;
  name: string;
}

interface ColorVariable {
  name: string;
  value: RGB | RGBA;
  mode?: string;
}

type ColorValue = {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
};

// Helper function to send message to the user interface
const sendUIMessage = (message: PluginMessage): void => {
  figma.ui.postMessage(message);
};

// Helper function to check if variable is an rgb or rgba color
const isRGBColor = (value: unknown): value is RGB | RGBA => {
  return typeof value === "object" && value !== null && "r" in value;
};

// Helper function to check if variable is an alias
const isVariableAlias = (value: unknown): value is VariableAlias => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  );
};

// Helper function to transform strings.
function transformString(string: string): string {
  return string
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_/]+/g, "-")
    .toLowerCase();
}

// Helper function: Convert RGBA to HEX
function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}

const normalizeColor = (value: ColorValue) => ({
  r: value.r ?? 0,
  g: value.g ?? 0,
  b: value.b ?? 0,
  a: value.a ?? 1,
});

function colorConstructor(value: ColorValue) {
  if (!value || typeof value !== "object") {
    return "#00000000";
  }
  const { r, g, b, a } = normalizeColor(value);

  return rgbaToHex(r, g, b, a);
}

// Helper function to format color variables.
const formatColorOutput = ({ name, value, mode }: ColorVariable): string => {
  const formattedName = transformString(name);
  const formattedValue = colorConstructor(value);
  return mode
    ? `${formattedName}-${transformString(mode)}: ${formattedValue}`
    : `${formattedName}: ${formattedValue}`;
};

async function processAliasVariable(
  aliasId: string,
  originalName: string,
  modes: Mode[],
  numberOfModes: number,
  collectionId: string
): Promise<VariablesOutput> {
  try {
    const alias = await figma.variables.getVariableByIdAsync(aliasId);
    if (!alias) return [];

    const colors: string[] = [];
    const aliasValuesByMode = alias.valuesByMode;

    if (numberOfModes === 1) {
      const [firstValue] = Object.values(aliasValuesByMode);
      if (isRGBColor(firstValue)) {
        colors.push(
          formatColorOutput({ name: originalName, value: firstValue })
        );
        return colors;
      }
    }

    const collection = await figma.variables.getVariableCollectionByIdAsync(
      collectionId
    );

    await Promise.all(
      Object.entries(aliasValuesByMode).map(async ([modeId, value]) => {
        const modeInfo = collection?.modes.find(
          (mode) => mode.modeId === modeId
        );

        if (isRGBColor(value)) {
          colors.push(
            formatColorOutput({
              name: originalName,
              value,
              mode: modeInfo?.name,
            })
          );
        }
      })
    );

    return colors;
  } catch (error) {
    console.error("Error processing alias variable:", error);
    return [];
  }
}

async function processColorVariable(
  variable: Variable,
  modes: Mode[],
  collectionId: string
): Promise<VariablesOutput> {
  try {
    const colorJSONOutput: VariablesOutput = {};
    const valuesByMode = variable.valuesByMode;
    const numberOfModes = Object.keys(valuesByMode).length;
    const nameParts = variable.name
      .split("/")
      .map((part) => part.trim().toLowerCase().replace(/\s+/g, "-"));
    const [category, key] = nameParts;
    if (!colorJSONOutput[category]) {
      colorJSONOutput[category] = {};
    }
    
    if (!colorJSONOutput[category][key]) {
      colorJSONOutput[category][key] = {};
    }

    for (const [modeId, value] of Object.entries(valuesByMode)) {
      // Check if value doesn't references another color variable
      if (isRGBColor(value)) {
        const modeName =
        numberOfModes > 1
        ? modes.find((mode) => mode.modeId === modeId)?.name
        : undefined;
        const colorValue = {
          value: colorConstructor(value),
          type: "color",
        };

        let currentLevel = colorJSONOutput;

      // First nesting level
        for (let i = 0; i < nameParts.length; i++) {
          const part = nameParts[i];

          // If we’re at the last part, assign value
          if (i === nameParts.length - 1) {
            // Insert modeName as level *if* multiple modes exist
            if (modeName) {
              // Create intermediate object
              if (!currentLevel[modeName]) {
                currentLevel[modeName] = {};
              }
              currentLevel = currentLevel[modeName];
            }

            currentLevel[part] = colorValue;
          } else {
            currentLevel[part] = currentLevel[part] || {};
            currentLevel = currentLevel[part];
          }
        }
      }
    }
    console.log('colorJSONOutput', colorJSONOutput);
    return colorJSONOutput;
  } catch (error) {
    return [];
  }
}

async function handleVariables(): Promise<object> {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables: VariablesOutput = {};

    for (const collection of collections) {
      for (const variableId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (variable?.resolvedType === "COLOR") {
          const colorOutput = await processColorVariable(
            variable,
            collection.modes,
            collection.id
          );
          Object.assign(allVariables, colorOutput);
        }
      }
    }
    return allVariables;
  } catch (error) {
    return {};
  }
  // return JSON.stringify(allVariables, null, 2);
}

// Helper function: Identify token type
// function getTokenType(category: string): TokenValue["type"] {
//   const typeMap: Record<string, TokenValue["type"]> = {
//     spacing: "spacing",
//     size: "sizing",
//     breakpoint: "other",
//     radius: "borderRadius",
//     color: "color",
//     typography: "typography",
//     text: "color" // Assuming text colors
//   };
//   return typeMap[category] || "other";
// }

// This shows the HTML page in "ui.html".
figma.showUI(__html__);
figma.ui.resize(500, 500);
figma.ui.onmessage = async () => {
  try {
    const variablesTransformed = await handleVariables();
    console.log("VARIABLES TRANSFORMED", variablesTransformed);
    // figma.closePlugin();
  } catch (error) {
    sendUIMessage({ message: "An unexpected error occurred" });
  }
};
