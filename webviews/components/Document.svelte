<script>
    import { blank_object } from 'svelte/internal';

    export let getSelectedText;
    export let sendText;
    export let complexPrompt;

    let asdf = `
\\usepackage[T1]\{fontenc\}
\\usepackage\{amsmath\}

\\begin\{document\}
\\noindent
Bla bla bla bla :
\\begin\{align*\}
A &amp;= B + C - D \\\\ \\\\
%phantom
&amp;\\phantom\{= B + C \\;\}
%phantom
+ D - E \\ \\
&amp;= F + G - H.
\\end\{align*\}
\\end\{document\}
    
    `;

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

<button on:click={() => sendText(copiedText, 'Document')}>Generate latex (single prompt)</button>
<button on:click={() => complexPrompt(copiedText, 'Document')}>Generate latex</button>

<textarea bind:value={responseText} placeholder="Response..." style="width: 100%; height: 200px;"
></textarea>
