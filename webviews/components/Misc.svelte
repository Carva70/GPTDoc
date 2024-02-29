<script>
    export let sendText;
    export let complexPrompt;

    let copiedText = '';
    let responseText = '';
    let responseImage = '';

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'responseText') {
            responseText = message.value;
        } else if (message.type === 'responseImage') {
            responseImage = message.value;
        }
    });
</script>

<h1>Misc view</h1>

<button on:click={() => sendText(copiedText, 'Uml')}>Generate uml (single prompt)</button>

<button on:click={() => complexPrompt(copiedText, 'Uml')}>Generate uml</button>

<textarea bind:value={responseText} placeholder="Response..." style="width: 100%; height: 200px;"
></textarea>

{#if responseImage}
    <img src={responseImage} alt="" style="max-width: 100%; height: auto;" />
{/if}
