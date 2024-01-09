<script>
    import { createEventDispatcher } from 'svelte';

    const dispatch = createEventDispatcher();

    async function setNavView(value) {
        dispatch('changeView', value);
    }
</script>

<nav>
    <ul>
        <li>
            <button on:click={() => setNavView('Comment')}>Comment</button>
        </li>
        <li>
            <button on:click={() => setNavView('Debug')}>Debug</button>
        </li>
        <li>
            <button on:click={() => setNavView('Test')}>Test</button>
        </li>
        <li>
            <button on:click={() => setNavView('Optimize')}>Optimize</button>
        </li>
        <li>
            <button on:click={() => setNavView('Rewrite')}>Rewrite</button>
        </li>
        <li>
            <button on:click={() => setNavView('Clean')}>Clean</button>
        </li>
    </ul>
</nav>

<style>
    nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px;
        background-color: #333;
        color: white;
    }

    ul {
        list-style-type: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
    }

    button {
        padding: 10px;
        cursor: pointer;
        width: 100%;
    }
</style>
