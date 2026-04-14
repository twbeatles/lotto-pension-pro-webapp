import { uiModalMethods } from './ui/modal.js';
import { uiDialogMethods } from './ui/dialog.js';
import { uiQrModalMethods } from './ui/qrModal.js';
import { uiToastMethods } from './ui/toast.js';
import { uiBallMethods } from './ui/balls.js';

export class UIManager {
    static _ballCache = new Map();
    static _modalStack = [];
    static _modalBindingsInstalled = false;
    static _dialogState = null;

    static init() {
        if (typeof document === 'undefined') return;
        this._ensureModalBindings();
        this._bindDialogControls();
        this._bindQrModalControls();
    }
}

Object.assign(
    UIManager,
    uiModalMethods,
    uiDialogMethods,
    uiQrModalMethods,
    uiToastMethods,
    uiBallMethods
);
