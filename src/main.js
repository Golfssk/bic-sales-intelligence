import './base.css';
import './theme.css';
import './dashboard.js';
import { initCloud } from './cloud.js';
import { initLatest } from './latest.js';
initLatest(window.BIC_APP);
initCloud(window.BIC_APP);
