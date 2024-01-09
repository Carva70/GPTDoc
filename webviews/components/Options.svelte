<script>
    import { createEventDispatcher } from 'svelte';

    export let openaiModels;
    export let currentModel;
    export let maxTokens;
    const dispatch = createEventDispatcher();

    function handleSelection(event) {
        currentModel = event.target.value;
        dispatch('changeModel', currentModel);
    }

    function handleMaxTokens(event) {
        maxTokens = event.target.value;
        dispatch('changeMaxTokens', maxTokens);
    }
</script>

<h1>Options</h1>

<select bind:value={currentModel} on:change={handleSelection}>
    {#each openaiModels as model (model)}
        <option value={model}>{model}</option>
    {/each}
</select>

<p>Selected Model: {currentModel}</p>

<p>Max token response:</p>
<input bind:value={maxTokens} type="number" on:change={handleMaxTokens} />
