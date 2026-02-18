<script lang="ts">
	import { uiState } from '$lib/state/uiStore';
	import MenuScreen from '../components/screens/MenuScreen.svelte';
	import FighterSelectScreen from '../components/screens/FighterSelectScreen.svelte';
	import MatchScreen from '../components/screens/MatchScreen.svelte';
	import ComingSoonScreen from '../components/screens/ComingSoonScreen.svelte';
</script>

{#if $uiState.screen === 'menu'}
	<MenuScreen />
{:else if $uiState.screen === 'setup'}
	<FighterSelectScreen />
{:else if $uiState.screen === 'match'}
	<MatchScreen />
{:else}
	<ComingSoonScreen label={$uiState.screen} />
{/if}
