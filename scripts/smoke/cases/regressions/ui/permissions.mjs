/* eslint-disable no-unused-vars */
import {
    assert,
    CheckModule,
    createDocumentStub,
    createField,
    DataManager,
    LottoApp,
    QrScannerModule,
    readFile,
    resolve,
    UIManager
} from '../support.mjs';

import { regressionBarrelExportNames } from '../manifest.mjs';

async function runNotificationPermissionRegression() {
    const previousToast = UIManager.toast;

    const toasts = [];

    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };

    try {
        const deniedCalls = [];

        await LottoApp.prototype.handleSystemNotificationToggle.call(
            {
                data: {
                    async requestNotificationPermission() {
                        deniedCalls.push('request');

                        return { code: 'denied', label: '차단됨' };
                    },

                    setAlertPrefs(next) {
                        deniedCalls.push(`set:${JSON.stringify(next)}`);
                    }
                },

                renderDataLists() {
                    deniedCalls.push('render');
                }
            },

            true
        );

        assert.deepEqual(
            deniedCalls,

            ['request', 'set:{"enableSystemNotification":false}', 'render'],

            'denied notification permission must revert the toggle state'
        );

        assert.ok(
            toasts.some((item) => item.startsWith('info:')),

            'denied flow must show 안내 toast'
        );

        toasts.length = 0;

        const grantedCalls = [];

        await LottoApp.prototype.handleSystemNotificationToggle.call(
            {
                data: {
                    async requestNotificationPermission() {
                        grantedCalls.push('request');

                        return { code: 'granted', label: '허용됨' };
                    },

                    setAlertPrefs(next) {
                        grantedCalls.push(`set:${JSON.stringify(next)}`);
                    }
                },

                renderDataLists() {
                    grantedCalls.push('render');
                }
            },

            true
        );

        assert.deepEqual(
            grantedCalls,

            ['request', 'set:{"enableSystemNotification":true}', 'render'],

            'granted notification permission must keep system notifications enabled'
        );

        assert.ok(
            toasts.some((item) => item.startsWith('success:')),

            'granted flow must show success toast'
        );
    } finally {
        UIManager.toast = previousToast;
    }
}

export { runNotificationPermissionRegression };
