<script>
    import 'vscode-webview';
    import Nav from './Nav.svelte';
    import Debug from './Debug.svelte';
    import Test from './Test.svelte';
    import Optimize from './Optimize.svelte';
    import Options from './Options.svelte';
    import Clean from './Clean.svelte';
    import Comment from './Comment.svelte';
    import Document from './Document.svelte';
    import Generate from './Generate.svelte';
    import Misc from './Misc.svelte';

    let currentModel = 'gpt-3.5-turbo-1106';
    let maxTokens = '256';
    let openaiModels = [];
    const vscode = acquireVsCodeApi();
    let currentView = 'Comment';
    let apiKey = '';
    let useChat = false;

    getApiModels();

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'sendmodels') {
            openaiModels = message.value;
        }
    });

    function changeView(event) {
        currentView = event.detail;
    }

    async function changeModel(event) {
        currentModel = event.detail;
        try {
            await vscode.postMessage({ type: 'onChangeModel', value: currentModel });
        } catch (error) {
            console.log('Error executing command:', error);
        }
    }

    async function changeMaxTokens(event) {
        maxTokens = event.detail;
        try {
            await vscode.postMessage({ type: 'onChangeMaxTokens', value: maxTokens });
        } catch (error) {
            console.log('Error executing command:', error);
        }
    }

    async function changeApiKey(event) {
        apiKey = event.detail;
        try {
            await vscode.postMessage({ type: 'onChangeApiKey', value: apiKey });
        } catch (error) {
            console.log('Error executing command:', error);
        }
        getApiModels();
    }

    async function changeUseChat(event) {
        useChat = event.detail;
        try {
            await vscode.postMessage({ type: 'onChangeUseChat', value: useChat });
        } catch (error) {
            console.log('Error executing command:', error);
        }
        getApiModels();
    }

    async function getApiModels() {
        try {
            await vscode.postMessage({ type: 'getmodels' });
        } catch (error) {
            console.log('Error executing command:', error);
        }
    }

    async function getSelectedText() {
        try {
            await vscode.postMessage({ type: 'gettext' });
        } catch (error) {
            console.log('Error executing command:', error);
        }
    }

    async function sendText(copiedText, view) {
        try {
            await vscode.postMessage({ type: 'sendtext', value: copiedText, view: view });
        } catch (error) {
            console.log('Error executing command:', error);
        }
    }

    async function replaceSelectedText(responseText) {
        try {
            await vscode.postMessage({ type: 'replacetext', value: responseText });
        } catch (error) {
            console.log('Error executing command:', error);
        }
    }
</script>

<Nav on:changeView={changeView} />

{#if currentView === 'Comment'}
    <Comment {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Debug'}
    <Debug {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Test'}
    <Test {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Optimize'}
    <Optimize {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Clean'}
    <Clean {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Document'}
    <Document {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Generate'}
    <Generate {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Misc'}
    <Misc {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Options'}
    <Options
        {openaiModels}
        {currentModel}
        {maxTokens}
        {apiKey}
        {useChat}
        on:changeModel={changeModel}
        on:changeMaxTokens={changeMaxTokens}
        on:changeApiKey={changeApiKey}
        on:changeUseChat={changeUseChat}
    />
{/if}
