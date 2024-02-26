<script>
    import { createEventDispatcher } from 'svelte';

    export let openaiModels;
    export let currentModel;
    export let maxTokens;
    export let apiKey;
    export let useChat;
    export let useLocalApi;

    const dispatch = createEventDispatcher();

    function handleSelection(event) {
        currentModel = event.target.value;
        dispatch('changeModel', currentModel);
    }

    function handleMaxTokens(event) {
        maxTokens = event.target.value;
        dispatch('changeMaxTokens', maxTokens);
    }

    function handleApiKey(event) {
        apiKey = event.target.value;
        dispatch('changeApiKey', apiKey);
    }

    function handleUseChat(event) {
        useChat = event.target.checked;
        dispatch('changeUseChat', useChat);
    }

    function handleUseLocalApi(event) {
        useLocalApi = event.target.checked;
        dispatch('changeUseLocalApi', useLocalApi);
    }
</script>

<h1>Options</h1>

<label>
    Use Local LLM:
    <input bind:checked={useLocalApi} type="checkbox" on:change={handleUseLocalApi} />
</label>

<label>
    Use ChatGPT (requires session key):
    <input bind:checked={useChat} type="checkbox" on:change={handleUseChat} />
</label>

<label>
    {#if useChat}
        ChatGPT Session Key:
    {:else}
        API Key:
    {/if}

    <input bind:value={apiKey} type="password" on:change={handleApiKey} />
</label>

{#if !useChat}
    <label>
        Select model:
        <select bind:value={currentModel} on:change={handleSelection}>
            {#each openaiModels as model (model)}
                <option value={model}>{model}</option>
            {/each}
        </select>
    </label>
{/if}

<label>
    Max token response:
    <input bind:value={maxTokens} type="number" on:change={handleMaxTokens} />
</label>

<style>
    label {
        display: block;
        margin-bottom: 10px; /* Add some space between labels */
    }
</style>
