<script>
    import 'vscode-webview';
    import Nav from './Nav.svelte';
    import Debug from './Debug.svelte';
    import Test from './Test.svelte';
    import Optimize from './Optimize.svelte';
    import Rewrite from './Rewrite.svelte';
    import Clean from './Clean.svelte';
    import Comment from './Comment.svelte';

    const vscode = acquireVsCodeApi();
    let currentView = 'Comment';

    function changeView(view) {
        currentView = view.detail;
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
{#if currentView === 'Rewrite'}
    <Rewrite {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
{#if currentView === 'Clean'}
    <Clean {getSelectedText} {sendText} {replaceSelectedText} />
{/if}
