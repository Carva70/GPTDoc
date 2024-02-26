"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const getNonce_1 = require("./getNonce");
const openai_1 = __importDefault(require("openai"));
const bard_ai_1 = __importDefault(require("bard-ai"));
class SidebarProvider {
    _extensionUri;
    _view;
    _doc;
    _apiKey;
    _maxTokens;
    _currentModel;
    _useChat;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this._apiKey = '';
        this._maxTokens = 256;
        this._currentModel = 'gpt-3.5-turbo-1106';
        this._useChat = false;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'onInfo': {
                    if (!data.value) {
                        return;
                    }
                    vscode.window.showInformationMessage(data.value);
                    break;
                }
                case 'onError': {
                    if (!data.value) {
                        return;
                    }
                    vscode.window.showErrorMessage(data.value);
                    break;
                }
                case 'onChangeModel': {
                    this._currentModel = data.value;
                    break;
                }
                case 'onChangeMaxTokens': {
                    this._maxTokens = parseInt(data.value);
                    break;
                }
                case 'onChangeApiKey': {
                    this._apiKey = data.value;
                    break;
                }
                case 'onChangeUseChat': {
                    this._useChat = data.value;
                    break;
                }
                case 'gettext': {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const selectedText = editor.document.getText(editor.selection);
                        webviewView.webview.postMessage({
                            type: 'setCopiedText',
                            value: selectedText,
                        });
                    }
                    break;
                }
                case 'getmodels': {
                    const models = await this.getModels();
                    webviewView.webview.postMessage({
                        type: 'sendmodels',
                        value: models,
                    });
                }
                case 'sendtext': {
                    try {
                        const responseText = await this.generatePrompt(data.value, data.view);
                        webviewView.webview.postMessage({
                            type: 'responseText',
                            value: responseText,
                        });
                    }
                    catch (error) {
                        console.error('Error in sendtext:', error);
                        vscode.window.showErrorMessage('Error processing text.');
                    }
                    break;
                }
                case 'replacetext': {
                    try {
                        const editor = vscode.window.activeTextEditor;
                        if (editor && data.value) {
                            const newText = data.value;
                            const selections = editor.selections;
                            editor.edit((editBuilder) => {
                                selections.forEach((selection) => {
                                    editBuilder.replace(selection, newText);
                                });
                            });
                            vscode.window.showInformationMessage('Texto reemplazado correctamente.');
                        }
                    }
                    catch (error) {
                        console.error('Error in replacetext:', error);
                        vscode.window.showErrorMessage('Error al reemplazar el texto.');
                    }
                    break;
                }
            }
        });
    }
    async generatePrompt(selected, view) {
        const codeBegin = '<begin>';
        const codeEnd = '<end>';
        const editor = vscode.window.activeTextEditor;
        let prompt = '';
        let systemMessage = '';
        switch (view) {
            case 'Comment': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with adding concise comments to the provided code. Follow these guidelines:\n' +
                        '- Use the appropriate comment syntax for the programming language: # in Python, // or /**/ in JavaScript or TypeScript.\n' +
                        '- Provide a brief comment at the beginning of the function explaining its overall purpose, including details about parameters, types, and inner variables.\n' +
                        '- Respond with only the code in text format. Do not return a markdown or any other format. Type the code directly.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'def add_numbers(a, b):\n' +
                        '    return a + b\n' +
                        'Your Response:\n' +
                        '# Adds two numbers.\n' +
                        '# Parameters:\n' +
                        '#   a (int): The first number to be added.\n' +
                        '#   b (int): The second number to be added.\n' +
                        '# Returns:\n' +
                        '#   int: The sum of a and b.\n' +
                        'def add_numbers(a, b):\n' +
                        '    return a + b\n';
                break;
            }
            case 'Long Comment': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with adding comprehensive comments to the provided code. Follow these guidelines:\n' +
                        '- Use the appropriate comment syntax for the programming language: # in Python, // or /**/ in JavaScript or TypeScript.\n' +
                        '- Provide detailed comments explaining the purpose of the code, the logic behind key decisions, and any potential improvements or considerations.\n' +
                        '- Respond with only the code in text format. You will not return a markdown of any type. You will type the code directly.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'def calculate_interest(principal, rate, time):\n' +
                        '    interest = principal * rate * time / 100\n' +
                        '    total_amount = principal + interest\n' +
                        '    return total_amount\n' +
                        'Your Response:\n' +
                        '# Calculates simple interest and total amount\n' +
                        '#\n' +
                        '# Parameters:\n' +
                        '#   principal (float): The principal amount.\n' +
                        '#   rate (float): The interest rate.\n' +
                        '#   time (int): The time period in years.\n' +
                        '#\n' +
                        '# Returns:\n' +
                        '#   float: The total amount after calculating simple interest.\n' +
                        'def calculate_interest(principal, rate, time):\n' +
                        '    # Formula for simple interest: interest = (principal * rate * time) / 100\n' +
                        '    interest = principal * rate * time / 100\n' +
                        '    # Calculate total amount by adding interest to principal\n' +
                        '    total_amount = principal + interest\n' +
                        '    # Return the total amount\n' +
                        '    return total_amount\n';
                break;
            }
            case 'Debug': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with debugging the provided code by adding print statements. Your goal is to help the developer identify and fix any issues in the code. Follow these guidelines:\n' +
                        '- Insert print statements strategically to output relevant variable values, messages, or any information that can assist in debugging.\n' +
                        '- Use the appropriate syntax for print statements in the programming language.\n' +
                        '- Do not use markdown; use only plain text format.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'def add_numbers(a, b):\n' +
                        '    return a + b\n' +
                        'Your Response:\n' +
                        'def add_numbers(a, b):\n' +
                        '    print("Input a:", a)\n' +
                        '    print("Input b:", b)\n' +
                        '    result = a + b\n' +
                        '    print("Result:", result)\n' +
                        '    return result\n';
                break;
            }
            case 'Test': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with creating test cases for the provided code. Follow these guidelines:\n' +
                        '- Write multiple test cases to ensure the code behaves as expected in different scenarios.\n' +
                        '- Include both normal and edge cases in your test suite.\n' +
                        '- Use the syntax in the programming language of the user text.\n' +
                        "- In non python lenguages, dont use assert, use other type of test that doesn't require libraries.\n" +
                        '- Respond with only the code in text format. Do not return a markdown or any other format. Type the code directly.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'def add_numbers(a, b):\n' +
                        '    return a + b\n' +
                        'Your Response:\n' +
                        'def test_add_numbers():\n' +
                        '    assert add_numbers(2, 3) == 5, "Test case 1 failed"\n' +
                        '    assert add_numbers(-1, 1) == 0, "Test case 2 failed"\n' +
                        '    assert add_numbers(0, 0) == 0, "Test case 3 failed"\n' +
                        '    # Add more test cases as needed\n' +
                        'test_add_numbers()\n';
                break;
            }
            case 'Optimize': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with optimizing the provided code. Follow these guidelines:\n' +
                        '- Identify and suggest improvements to make the code more efficient and readable.\n' +
                        '- Optimize algorithms, loops, or any other parts of the code that can be enhanced.\n' +
                        '- Provide comments explaining the optimizations you made.\n' +
                        '- Respond with only the code in text format. Do not return a markdown or any other format. Type the code directly.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'function findMax(arr) {\n' +
                        '    let max = arr[0];\n' +
                        '    for (let i = 1; i < arr.length; i++) {\n' +
                        '        if (arr[i] > max) {\n' +
                        '            max = arr[i];\n' +
                        '        }\n' +
                        '    }\n' +
                        '    return max;\n' +
                        '}\n' +
                        'Your Response:\n' +
                        '// Optimized code to use Math.max for finding the maximum element\n' +
                        'function findMax(arr) {\n' +
                        '    return Math.max(...arr);\n' +
                        '}\n';
                break;
            }
            case 'Clean': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with cleaning up the provided code. Follow these guidelines:\n' +
                        '- Remove any unnecessary comments, redundant code, or unused variables.\n' +
                        '- Ensure consistent indentation and formatting according to the programming language conventions.\n' +
                        '- Improve the overall readability of the code without changing its functionality.\n' +
                        '- Respond with only the code in text format. Do not return a markdown or any other format. Type the code directly.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'function   addNumbers(  a, b ){\n' +
                        '    // Adds two numbers\n' +
                        '    return a + b;\n' +
                        '}\n' +
                        'Your Response:\n' +
                        'function addNumbers(a, b) {\n' +
                        '    return a + b;\n' +
                        '}\n';
                break;
            }
            case 'Generate': {
                if (editor) {
                    const entireDocument = editor.document.getText();
                    prompt = `Document:\n${entireDocument}\nGenerate:\n${selected}\n`;
                    systemMessage =
                        'You are an assistant tasked with generating code based on the provided prompt and the entire document. Follow these guidelines:\n' +
                            '- Utilize the prompt to guide the generation process.\n' +
                            '- Consider the context provided by the entire document.\n' +
                            '- Generate code that is relevant and follows best practices.\n' +
                            '- Respond with only the code in text format. Do not return a markdown or any other format. Type the code directly.\n\n' +
                            '**Example**:\n' +
                            'Document:\n' +
                            '# Mult function\n\n' +
                            'def mult(a, b):\n' +
                            '    return a * b\n' +
                            '# Exponential function using mult function\n\n' +
                            '# Add function\n' +
                            'def add(a, b):\n' +
                            '    return a + b\n' +
                            'Generate:\n' +
                            '# Exponential function using mult function\n' +
                            '**Your Response**:\n' +
                            '# Exponential function using mult function\n' +
                            'def exponential(a, b):\n' +
                            '    result = 1\n' +
                            '    for _ in range(b):\n' +
                            '        result = mult(result, a)\n' +
                            '    return result\n';
                    break;
                }
                else {
                    console.error('No active text editor found.');
                }
            }
            case 'Document': {
                prompt = selected;
                systemMessage =
                    'You are an assistant tasked with generating a detailed LaTeX documentation for the provided code. Follow these guidelines:\n' +
                        '- Use LaTeX syntax to create a well-structured documentation.\n' +
                        '- Include sections such as Introduction, Functionality, Parameters, Return Values, Usage, and Examples.\n' +
                        '- Provide detailed explanations for each section, explaining the purpose and functionality of the code.\n' +
                        '- Respond with only the LaTeX code in text format. Do not return a markdown or any other format. Type the LaTeX code directly.\n\n' +
                        'Example:\n' +
                        'User code:\n' +
                        'function addNumbers(a, b) {\n' +
                        '    // Adds two numbers\n' +
                        '    return a + b;\n' +
                        '}\n' +
                        'Your Response:\n' +
                        '\\section{Introduction}\n' +
                        'This code defines a function to add two numbers.\n\n' +
                        '\\section{Functionality}\n' +
                        'The function takes two parameters and returns their sum.\n\n' +
                        '\\section{Parameters}\n' +
                        '\\begin{itemize}\n' +
                        '\\item \\texttt{a} - The first number to be added.\n' +
                        '\\item \\texttt{b} - The second number to be added.\n' +
                        '\\end{itemize}\n\n' +
                        '\\section{Return Values}\n' +
                        'The function returns the sum of the input numbers.\n\n' +
                        '\\section{Usage}\n' +
                        'To use this function, call it with two numbers as arguments.\n\n' +
                        '\\section{Examples}\n' +
                        '\\begin{verbatim}\n' +
                        'result = addNumbers(3, 5);\n' +
                        '\\end{verbatim}\n';
                break;
            }
            case 'Uml': {
                if (editor) {
                    const code = editor.document.getText();
                    prompt = `Code:\n${code}\n`;
                    systemMessage =
                        'You are an assistant tasked with generating a UML diagram from the provided code. Follow these guidelines:\n' +
                            '- Use PlantUML syntax to describe the UML elements based on the provided code.\n' +
                            '- Include class diagrams and relationships.\n' +
                            '- Clearly represent classes, attributes, methods, and associations.\n' +
                            '- Ensure that the generated UML is coherent and reflects the structure of the code.\n' +
                            '- Respond with only the PlantUML code in text format. Do not return a markdown or any other format. Type the PlantUML code directly.\n\n' +
                            'Example:\n' +
                            'Code:\n' +
                            'class Person {\n' +
                            '    String name;\n' +
                            '    int age;\n' +
                            '    void speak() {\n' +
                            '        // Method implementation\n' +
                            '    }\n' +
                            '}\n' +
                            'Your Response:\n' +
                            '@startuml\n' +
                            'class Person {\n' +
                            '  +name: String\n' +
                            '  +age: int\n' +
                            '  {method} +speak(): void\n' +
                            '}\n' +
                            '@enduml\n';
                    break;
                }
                else {
                    console.error('No active text editor found.');
                }
            }
            default: {
                return 'error';
            }
        }
        console.log('systemMessage:', systemMessage);
        try {
            let responseText = '';
            if (this._useChat) {
                responseText = await this.chatGptCall(prompt, systemMessage);
            }
            else {
                responseText = await this.openaiApiCall(prompt, systemMessage);
            }
            console.log(responseText);
            return responseText;
        }
        catch (error) {
            console.error('Error in transformText:', error);
            throw error;
        }
    }
    async chatGptCall(prompt, systemMessage) {
        var plantuml = require('node-plantuml');
        var fs = require('fs');
        var gen = plantuml.generate('input-file');
        gen.out.pipe(fs.createWriteStream('output-file.png'));
        let myBard = new bard_ai_1.default(this._apiKey);
        let response = await myBard.ask(systemMessage + '\nUser code:\n' + prompt);
        if (typeof response === 'string') {
            return this.removeMarkdownFormat(response);
        }
        else {
            return null;
        }
    }
    removeMarkdownFormat(input) {
        const regex = /```[a-zA-Z]*\n([\s\S]*?)\n```/;
        return input.replace(regex, '$1');
    }
    async openaiApiCall(prompt, systemMessage) {
        const openai = new openai_1.default({ apiKey: this._apiKey });
        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: systemMessage,
                    },
                    { role: 'user', content: prompt },
                ],
                model: this._currentModel,
                response_format: { type: 'text' },
                max_tokens: this._maxTokens,
            });
            return completion.choices[0].message.content;
        }
        catch (error) {
            console.error('Error calling OpenAI API:', error);
            throw error;
        }
    }
    async getModels() {
        const openai = new openai_1.default({ apiKey: this._apiKey });
        try {
            const modelList = await openai.models.list();
            return modelList.data
                .map((model) => model.id)
                .filter((id) => id.includes('gpt'))
                .sort();
        }
        catch (error) {
            console.error('Error fetching model list:', error);
            return [];
        }
    }
    revive(panel) {
        this._view = panel;
    }
    _getHtmlForWebview(webview) {
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'compiled/sidebar.js'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'compiled/sidebar.css'));
        // Use a nonce to only allow a specific script to be run.
        const nonce = (0, getNonce_1.getNonce)();
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
        -->
        <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">

			</head>
      <body>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
//# sourceMappingURL=SidebarProvider.js.map