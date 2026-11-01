import './helpers/string-colors.js';
import { getMessageFromModel } from './actions/get-message-model.js';
import { toolUseMain } from './patterns/01-tool-use/tool-use.js';

console.clear();

await toolUseMain();

await getMessageFromModel();
