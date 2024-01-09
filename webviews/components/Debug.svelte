<script>
    export let getSelectedText;
    export let sendText;
    export let replaceSelectedText;

    console.log(getSelectedText);
    let copiedText = '';
    let responseText = '';

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'setCopiedText') {
            copiedText = message.value;
        } else if (message.type === 'responseText') {
            responseText = message.value;
        }
    });
</script>

<h1>Debug view</h1>
<button on:click={() => getSelectedText()}>Selection to prompt</button>

<textarea bind:value={copiedText} placeholder="Prompt code" style="width: 100%; height: 200px;"
></textarea>

<button on:click={() => sendText(copiedText, 'Debug')}>Generate traced code</button>

<textarea bind:value={responseText} placeholder="Response..." style="width: 100%; height: 200px;"
></textarea>

<button on:click={() => replaceSelectedText(responseText)}>Replace selected text</button>
