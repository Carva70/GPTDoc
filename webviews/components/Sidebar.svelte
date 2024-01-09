<script>
    import 'vscode-webview';
    import Nav from './Nav.svelte';
    import Debug from './Debug.svelte';
    import Test from './Test.svelte';
    import Optimize from './Optimize.svelte';
    import Options from './Options.svelte';
    import Clean from './Clean.svelte';
    import Comment from './Comment.svelte';

    let currentModel = 'gpt-3.5-turbo-1106';
    let maxTokens = '256';
    let openaiModels = [];
    const vscode = acquireVsCodeApi();
    let currentView = 'Comment';

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

    function changeModel(event) {
        currentModel = event.detail;
    }

    function changeMaxTokens(event) {
        maxTokens = event.detail;
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
{#if currentView === 'Options'}
    <Options
        {openaiModels}
        {currentModel}
        {maxTokens}
        on:changeModel={changeModel}
        on:changeMaxTokens={changeMaxTokens}
    />
{/if}
