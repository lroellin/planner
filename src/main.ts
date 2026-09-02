import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { applyDensity } from './state/ui.svelte';

// Before anything renders: FullCalendar measures one slot row at first render and
// sizes the whole grid from it, so the density has to be on the document already.
applyDensity();

mount(App, { target: document.getElementById('app')! });
