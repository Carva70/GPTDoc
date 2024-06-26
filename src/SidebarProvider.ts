import * as vscode from 'vscode';
import { getNonce } from './getNonce';
import OpenAI from 'openai';
import Bard from 'bard-ai';
import axios from 'axios';

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    _apiKey: string;
    _maxTokens: number;
    _currentModel: string;
    _useChat: boolean;
    _useLocalApi: boolean;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._apiKey = '';
        this._maxTokens = 256;
        this._currentModel = 'gpt-3.5-turbo-1106';
        this._useChat = false;
        this._useLocalApi = false;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
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
                case 'onChangeUseLocalApi': {
                    this._useLocalApi = data.value;
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
                        let responseText = await this.generatePrompt(data.value, data.view);
                        if (data.view == 'Uml') {
                            const { geturl } = require('./plantuml.js');
                            if (responseText !== null) {
                                const isCodeBlock = responseText.startsWith('```');

                                const noMdResponse = isCodeBlock
                                    ? responseText.split('\n').slice(1, -1).join('\n')
                                    : responseText;

                                responseText = noMdResponse;
                            }
                            const responseImage = geturl(responseText);
                            webviewView.webview.postMessage({
                                type: 'responseImage',
                                value: responseImage,
                            });
                        }
                        webviewView.webview.postMessage({
                            type: 'responseText',
                            value: responseText,
                        });
                    } catch (error) {
                        console.error('Error in sendtext:', error);
                        vscode.window.showErrorMessage('Error processing text.');
                    }
                    break;
                }
                case 'complexPrompt': {
                    let responseText: string | null = '';
                    if (data.view == 'Uml') {
                        responseText = await this.umlComplexPrompt();

                        const { geturl } = require('./plantuml.js');
                        if (responseText !== null) {
                            const isCodeBlock = responseText.startsWith('```');

                            const noMdResponse = isCodeBlock
                                ? responseText.split('\n').slice(1, -1).join('\n')
                                : responseText;

                            responseText = noMdResponse;
                        }
                        const responseImage = geturl(responseText);
                        webviewView.webview.postMessage({
                            type: 'responseImage',
                            value: responseImage,
                        });
                    } else if (data.view == 'Document') {
                        responseText = await this.latexComplexPrompt();
                    }
                    webviewView.webview.postMessage({
                        type: 'responseText',
                        value: responseText,
                    });
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

                            vscode.window.showInformationMessage(
                                'Texto reemplazado correctamente.',
                            );
                        }
                    } catch (error) {
                        console.error('Error in replacetext:', error);
                        vscode.window.showErrorMessage('Error al reemplazar el texto.');
                    }
                    break;
                }
            }
        });
    }

    private async umlComplexPrompt(): Promise<string | null> {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return null;
        }

        const code = editor.document.getText();
        const codePrompt = `Please provide a concise overview of the code:\n${code}\n`;

        const systemMessageClasses = `You are an assistant. Summarize each class by listing its attributes (and their types) and methods in a few words:\n`;

        const systemMessageRelations = `You are an assistant. Review the code for class relations. For each class, mention any relations using 4-5 words. Classify as aggregation, composition, extension, etc. Also, specify one-to-one, one-to-many, or many-to-many relations:\n`;

        const responseClassesAttributes = await this.callPrompt(codePrompt, systemMessageClasses);
        console.log(responseClassesAttributes);

        const responseRelations = await this.callPrompt(codePrompt, systemMessageRelations);
        console.log(responseRelations);

        if (responseClassesAttributes && responseRelations) {
            const systemMessage =
                'You are an assistant. Generate a comprehensive PlantUML diagram from the provided classes and their attributes. Respond only with the PlantUML code, using @startuml //plantuml @enduml format. Ensure correct arrow usage for each relation. Ensure all relations are represented:\n';

            const generateUmlPrompt = `Classes and Attributes:\n${responseClassesAttributes}\n\nRelations:\n${responseRelations}`;
            const response = await this.callPrompt(generateUmlPrompt, systemMessage);
            console.log(response);

            if (response) return response;
            return null;
        }

        return null;
    }

    private async latexComplexPrompt(): Promise<string | null> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const code = editor.document.getText();
        const codePrompt = `Code:\n${code}\n`;

        const introFuncMsg =
            'You are an assistant. Generate the Introduction and Functionality sections for the LaTeX documentation.\n' +
            'Provide a brief explanation of the code and explain what it does and how it achieves its purpose.\n' +
            'The response must be 2 sections in latex format.\n' +
            'List using itemize.\n' +
            'Response example:\n' +
            '\\section{Introduction}\n' +
            'In this document we present a sorting algorithm using a divide and conquer approach.\n' +
            '\\section{Functionality}\n' +
            'It takes an unsorted array as input and returns the array sorted in ascending order.\n';

        const paramsReturnValsMsg =
            'You are an assistant. Generate the Parameters and Return Values sections for the LaTeX documentation.\n' +
            'List and describe the parameters used in the code, and explain the values returned by the code.\n' +
            'The response must be 1 section in latex format.\n' +
            'Response example:\n' +
            '\\section{Parameters and Return Values}\n' +
            'The function takes two parameters:\n' +
            '\\begin{itemize}\n' +
            '    \\item \\texttt{arr}: The unsorted array to be sorted.\n' +
            '    \\item \\texttt{len}: The length of the array.\n' +
            '\\end{itemize}\n' +
            'The function returns void.\n';

        const usageExamplesMsg =
            'You are an assistant. Generate the Usage and Examples sections for the LaTeX documentation.\n' +
            'Describe how to use the code and provide examples demonstrating its usage.\n' +
            'The response must be 1 section in latex format.\n' +
            'Response example:\n' +
            '\\section{Usage and Examples}\n' +
            'To use the sorting algorithm, call the function as follows:\n' +
            '\\begin{verbatim}\n' +
            'sortArray(myArray, length);\n' +
            '\\end{verbatim}\n' +
            '\\subsection{Example 1}\n' +
            'Sort an array of integers:\n' +
            '\\begin{verbatim}\n' +
            'const myArray = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];\n' +
            'sortArray(myArray, myArray.length);\n' +
            '\\end{verbatim}\n' +
            '\\subsection{Example 2}\n' +
            'Sort an array of strings:\n' +
            '\\begin{verbatim}\n' +
            'const strArray = ["apple", "orange", "banana", "grape"];\n' +
            'sortArray(strArray, strArray.length);\n' +
            '\\end{verbatim}\n';

        const respIntroFunc = await this.callPrompt(
            codePrompt +
                'Give me a long detailed code in LaTeX format about the Introduction and Functionality in plain text.',
            introFuncMsg,
        );
        console.log(respIntroFunc);

        const respParamsReturnVals = await this.callPrompt(
            codePrompt +
                'Give me a long detailed code in LaTeX format about the Parameters and Return Values in plain text.',
            paramsReturnValsMsg,
        );
        console.log(respParamsReturnVals);

        const respUsageExamples = await this.callPrompt(
            codePrompt +
                'Give me a long detailed code in LaTeX format about the Usage and Examples sections in plain text.',
            usageExamplesMsg,
        );
        console.log(respUsageExamples);

        if (respIntroFunc && respParamsReturnVals && respUsageExamples) {
            return `
            ${respIntroFunc}
            ${respParamsReturnVals}
            ${respUsageExamples}
            `;
        }

        return null;
    }

    private async callPrompt(prompt: string, systemmessage: string): Promise<string | null> {
        if (this._useLocalApi) return this.localCall(prompt, systemmessage);
        return this.openaiApiCall(prompt, systemmessage);
    }

    private async generatePrompt(selected: string, view: string): Promise<string | null> {
        const codeBegin = '<begin>';
        const codeEnd = '<end>';
        const editor = vscode.window.activeTextEditor;
        let prompt: string = '';
        let systemMessage: string = '';

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
                    '- Respond with only the code in text format. Do not return a markdown or any other format.\n' +
                    '- Dont put any explanation at the end or beginning and type the code directly.\n\n' +
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
                    const cursorPosition = editor.selection.active;
                    const currentLineIndex = cursorPosition.line;

                    const codeAboveCursor = entireDocument
                        .split('\n')
                        .slice(0, currentLineIndex)
                        .join('\n');

                    const codeBelowCursor = entireDocument
                        .split('\n')
                        .slice(currentLineIndex + 1)
                        .join('\n');

                    prompt = `Document:\n${codeAboveCursor}\n*** Insert Code Here ***\n${codeBelowCursor}\n`;

                    systemMessage =
                        'You are an assistant tasked with generating code based on the provided prompt and the current line where the cursor is positioned. Follow these guidelines:\n' +
                        '- Utilize the prompt to guide the generation process.\n' +
                        '- Consider the context provided by the code above, below, and at the cursor position.\n' +
                        '- Generate code that is relevant and follows best practices.\n' +
                        '- Respond with only the code in text format. Do not return a markdown or any other format. Type the code directly.\n\n' +
                        '**Example**:\n' +
                        'Document:\n' +
                        '# Mult function\n\n' +
                        'def mult(a, b):\n' +
                        '    return a * b\n' +
                        '# Exponential function using mult function\n\n' +
                        '*** Insert Code Here ***\n' +
                        '# Add function\n' +
                        'def add(a, b):\n' +
                        '    return a + b\n' +
                        '**Your Response**:\n' +
                        'def exponential(a, b):\n' +
                        '    result = 1\n' +
                        '    for _ in range(b):\n' +
                        '        result = mult(result, a)\n' +
                        '    return result\n';
                    break;
                } else {
                    console.error('No active text editor found.');
                }
            }
            case 'Document': {
                if (editor) {
                    const entireDocument = editor.document.getText();
                    prompt = `Document:\n${entireDocument}\n\n Generate a detailed latex document based on this code\n`;

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
                        'In this document we present a function to add two numbers.\n\n' +
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
                } else {
                    console.error('No active text editor found.');
                }
            }
            case 'Uml': {
                if (editor) {
                    const code = editor.document.getText();
                    prompt = `Code:\n${code}\n Generate the PlantUML diagram, only give me the diagram in text format. No explanation needed`;

                    systemMessage =
                        'You are an assistant tasked with generating a comprehensive UML diagram from the provided code. The code represents a system with various classes and relationships. Follow these guidelines:\n' +
                        '- Use PlantUML syntax to describe the UML elements based on the provided code.\n' +
                        '- Carefully go through the code and identify classes in the first step. List all the classes with their attributes and methods in the PlantUML syntax.\n' +
                        '- In the second step, focus on relationships. For each class, identify and represent the correct inheritance (<|--), realization/implementation, composition (*--), aggregation (o--), association, or dependency in PlantUML syntax.\n' +
                        '- In the third step, ensure that there are no repeated relations and optimize the UML diagram for clarity.\n' +
                        '- Pay attention to details, such as multiplicity and role names in associations.\n' +
                        '- Respond only with the generated PlantUML code in the @startuml //plantuml @enduml format, no explanation.\n\n' +
                        'Code Snippet:\n' +
                        '```java\n' +
                        '// Insert relevant code snippet here\n' +
                        '```\n\n' +
                        'Your Response:\n' +
                        '@startuml\n' +
                        'class ClassA {\n' +
                        '    - attribute1: DataType\n' +
                        '    + method1(): ReturnType\n' +
                        '}\n\n' +
                        'class ClassB {\n' +
                        '    # attribute2: DataType\n' +
                        '    - method2(param: ParameterType): ReturnType\n' +
                        '}\n\n' +
                        'class ClassC {\n' +
                        '    * attribute3: DataType\n' +
                        '    {static} + method3(): ReturnType\n' +
                        '}\n\n' +
                        'ClassA <|-- ClassB\n' +
                        'ClassB <|.. ClassC\n' +
                        'ClassA "1" o-- "*" ClassC : Contains\n' +
                        'ClassA "1" *-- "*" ClassB : Manages\n' +
                        'ClassA "*" -- "*" ClassB : Has\n' +
                        '@enduml\n';

                    break;
                } else {
                    console.error('No active text editor found.');
                }
            }
            default: {
                return 'error';
            }
        }
        console.log('systemMessage:', systemMessage);

        try {
            let responseText: string | null = '';
            if (this._useLocalApi) {
                responseText = await this.localCall(prompt, systemMessage);
            } else {
                if (this._useChat) {
                    responseText = await this.chatGptCall(prompt, systemMessage);
                } else {
                    responseText = await this.openaiApiCall(prompt, systemMessage);
                }
            }

            console.log(responseText);
            return responseText;
        } catch (error) {
            console.error('Error in transformText:', error);
            throw error;
        }
    }

    private async localCall(prompt: string, systemMessage: string): Promise<string | null> {
        const url = 'http://localhost:5000/run_simulation';

        const data = {
            system_message: systemMessage,
            user_message: prompt,
            max_seq_len: this._maxTokens,
        };

        try {
            const response = await axios.post(url, data);

            if (response.status === 200) {
                let result = response.data.result || '';
                result = result.split('\n').slice(4).join('\n');
                return result;
            } else {
                const errorMessage = response.data.error || '';
                console.log(`Error: ${errorMessage}`);
                return null;
            }
        } catch (error) {
            console.error('An error occurred:', error);
            return null;
        }
    }

    private async chatGptCall(prompt: string, systemMessage: string): Promise<string | null> {
        let myBard = new Bard(this._apiKey);

        let response = await myBard.ask(systemMessage + '\nUser code:\n' + prompt);

        if (typeof response === 'string') {
            return this.removeMarkdownFormat(response);
        } else {
            return null;
        }
    }

    private removeMarkdownFormat(input: string): string {
        const regex = /```[a-zA-Z]*\n([\s\S]*?)\n```/;
        return input.replace(regex, '$1');
    }

    private async openaiApiCall(prompt: string, systemMessage: string): Promise<string | null> {
        const openai = new OpenAI({ apiKey: this._apiKey });

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
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            throw error;
        }
    }

    private async getModels(): Promise<string[]> {
        const openai = new OpenAI({ apiKey: this._apiKey });
        try {
            const modelList = await openai.models.list();
            return modelList.data
                .map((model) => model.id)
                .filter((id) => id.includes('gpt'))
                .sort();
        } catch (error) {
            console.error('Error fetching model list:', error);
            return [];
        }
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'),
        );
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'),
        );

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'compiled/sidebar.js'),
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'compiled/sidebar.css'),
        );

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

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
