import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyDensity } from './state/ui.svelte';

// Before anything renders, so the grid's first layout is already at the saved
// density rather than re-measuring a frame later.
applyDensity();

mount(App, { target: document.getElementById('app')! });
