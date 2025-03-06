// interface TokenValue {
//   value: string | number;
//   type: "color" | "spacing" | "sizing" | "borderRadius" | "typography" | "other";
//   description?: string;
// }

interface PluginMessage {
  message?: string;
}

interface VariablesOutput {
  [key: string]: string;
}

interface Mode {
  modeId: string;
  name: string;
}

interface ColorVariable {
  name: string;
  value: RGBA;
  mode?: string;
}

// Utility functions
const sendUIMessage = (message: PluginMessage): void => {
  figma.ui.postMessage(message);
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
  const to255 = (val: number) => Math.round(val * 255);
  return `#${to255(r).toString(16)}${to255(g).toString(16)}${to255(b).toString(
    16
  )}${to255(a).toString(16)}`;
}

const formatColorOutput = ({ name, value, mode }: ColorVariable): string => {
  const formattedName = transformString(name);
  const formattedValue = rgbaToHex(value.r, value.g, value.b, value.a);
  return mode
    ? `${formattedName}-${transformString(mode)}: ${formattedValue}`
    : `${formattedName}: ${formattedValue}`;
};

async function processColorVariable(
  variable: Variable,
  modes: Mode[],
  collectionId: string
): Promise<string[]> {
  try {
    const colors: string[] = [];
    const valuesByMode = variable.valuesByMode;
    const numberOfModes = Object.keys(valuesByMode).length;

    await Promise.all(
      Object.entries(valuesByMode).map(async ([modeId, value]) => {
        const modeName =
          numberOfModes > 1
            ? modes.find((mode) => mode.modeId === modeId)?.name
            : undefined;

        if (
          typeof value === "object" &&
          value !== null &&
          "type" in value &&
          value.type === "VARIABLE_ALIAS"
        ) {
          console.log('here');
        } else {
          const color = formatColorOutput({
            name: variable.name,
            value,
            mode: modeName,
          });
          colors.push(color);
          return;
        }
      })
    );
    return colors;
  } catch (error) {
    console.error("Error processing color variable:", error);
    return [];
  }
}

async function handleVariables(): Promise<void> {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables: VariablesOutput = {};

    await Promise.all(
      collections.flatMap(collection => 
        collection.variableIds.map(async (variableId) => {
          const variable = await figma.variables.getVariableByIdAsync(
            variableId
          );
          if (variable?.resolvedType === "COLOR") {
            const colors = await processColorVariable(
              variable,
              collection.modes,
              collection.id
            );

            colors.forEach((color) => {
              const [key, value] = color.split(": ");
              allVariables[key] = value;
            });
          }
        })
      )
    );
    return allVariables;
  } catch (error) {
    console.error("Error processing color variable:", error);
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

// async function pushToGitHub(token: string, repo: string, branch: string, filePath: string, fileContent: string) {
//   const apiBase = `https://api.github.com/repos/${repo}`;
//   const headers = {
//     "Authorization": `Bearer ${token}`,
//     "Accept": "application/vnd.github.v3+json",
//     "Content-Type": "application/json",
//   };

//   // console.log('pushToGitHub', apiBase, headers, branch, filePath, fileContent);
// }

// This shows the HTML page in "ui.html".
figma.showUI(__html__);
figma.ui.resize(500, 500);
figma.ui.onmessage = async (pluginMessage) => {
  const { githubtoken, repo, branch, filepath } = pluginMessage;
  console.log("REPO", githubtoken, repo, branch, filepath);

  try {
    const variablesTransformed = await handleVariables();
    console.log("VARIABLES", variablesTransformed);

    // await pushToGitHub(
    //   githubtoken,
    //   repo,
    //   branch,
    //   filepath,
    //   cssFile
    // );
    // figma.closePlugin();
  } catch (error) {
    sendUIMessage({ message: "An unexpected error occurred" });
  }
};
