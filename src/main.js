import './base.css';
import './theme.css';
import './dashboard.js';
import { initCloud } from './cloud.js';
initCloud(window.BIC_APP);
// Clearly labelled sample data; never uploaded automatically.
window.BIC_TEST.loadDemo();
