// ============================================================
// push-self-test.js
// Calculator 0209 v93
// 1台だけでPush通知経路を確認する専用モジュール
// ============================================================

import Firebase from './firebase.js';
import Settings from './settings.js';
import Notifications from './notifications.js';
import Supabase from './supabase.js';

let isBound = false;

function setStatus(message) {
  const label =
    document.getElementById(
      'selfPushTestStatus',
    );

  if (label) {
    label.textContent =
      message;
  }
}

async function sendSelfPushTest(
  button,
) {
  if (
    button instanceof
      HTMLButtonElement
  ) {
    button.disabled = true;
  }

  setStatus(
    'テスト通知を送信しています…',
  );

  try {
    if (
      !Settings
        .isNotificationsEnabled()
    ) {
      throw new Error(
        '通知をONにしてください。',
      );
    }

    if (
      Notifications
        .getPermissionState() !==
        'granted'
    ) {
      throw new Error(
        'iPhoneの通知許可が有効ではありません。',
      );
    }

    const roomId =
      Firebase.getLocalRoomId();

    if (!roomId) {
      throw new Error(
        '通知登録先のルームがありません。',
      );
    }

    const uid =
      await Firebase
        .ensureSignedIn();

    const clientId =
      Firebase
        .getOrCreateClientId();

    const target =
      await Firebase
        .getPushRegistrationTarget(
          roomId,
          uid,
          clientId,
        );

    if (!target) {
      throw new Error(
        'このiPhoneの通知先IDを取得できません。通知をOFF→ONして再登録してください。',
      );
    }

    const result =
      await Supabase
        .sendMessagePush({
          targetId:
            target.targetId,
          targetType:
            target.targetType,
          title:
            'Calculator',
          message:
            'テスト通知です',
          data: {
            type:
              'calculator-0209-self-test',
            roomId,
            sentAt:
              new Date()
                .toISOString(),
          },
        });

    if (
      result?.success !== true
    ) {
      throw new Error(
        'FCMがテスト通知を受け付けませんでした。',
      );
    }

    setStatus(
      target.targetType ===
        'fid'
        ? '送信成功（FID）。Calculatorを閉じて通知を確認してください。'
        : '送信成功（FCM）。Calculatorを閉じて通知を確認してください。',
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    setStatus(
      `テスト失敗：${message}`,
    );

    console.error(
      '[push-self-test.js]',
      error,
    );
  } finally {
    if (
      button instanceof
        HTMLButtonElement
    ) {
      button.disabled = false;
    }
  }
}

function bindSelfPushButton() {
  if (isBound) {
    return;
  }

  const button =
    document.getElementById(
      'selfPushTestBtn',
    );

  if (
    !(
      button instanceof
        HTMLButtonElement
    )
  ) {
    return;
  }

  button.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      sendSelfPushTest(
        button,
      );
    },
  );

  isBound = true;
}

if (
  document.readyState ===
    'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    bindSelfPushButton,
    {
      once: true,
    },
  );
} else {
  bindSelfPushButton();
}
