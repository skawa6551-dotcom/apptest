// ----------------------------------------------------------

// 匿名ログイン

// ----------------------------------------------------------

updateDiagnostic(

  'anonymous-sign-in',

  'Supabase匿名ログインを開始しています',

);

signInPromise =

  (async () => {

    let result;

    try {

      result =

        await client.auth.signInAnonymously();

      // ===== デバッグ表示 =====

      alert(

        JSON.stringify(

          {

            data: result?.data ?? null,

            error: result?.error ?? null,

          },

          null,

          2,

        ),

      );

    } catch (error) {

      // ===== 通信エラー表示 =====

      alert(

        'Supabase Error\n\n' +

        JSON.stringify(error, null, 2),

      );

      updateDiagnostic(

        'anonymous-sign-in-error',

        'Supabase匿名ログイン通信に失敗しました',

        error,

      );

      throw error;

    }

    const data =

      result?.data ??

      null;

    const error =

      result?.error ??

      null;

    if (error) {

      alert(

        'Supabase Auth Error\n\n' +

        JSON.stringify(error, null, 2),

      );

      updateDiagnostic(

        'anonymous-sign-in-error',

        'Supabase匿名ログインに失敗しました',

        error,

      );

      console.error(

        '[supabase.js] 匿名ログインに失敗しました',

        error,

      );

      throw error;

    }

    if (!data?.user) {

      const missingUserError =

        new Error(

          'Supabaseから匿名ユーザー情報が返されませんでした。',

        );

      alert(

        missingUserError.message,

      );

      updateDiagnostic(

        'anonymous-user-missing',

        '匿名ユーザー情報を取得できませんでした',

        missingUserError,

      );

      throw missingUserError;

    }

    updateDiagnostic(

      'authenticated',

      'Supabase匿名ログインに成功しました',

      null,

      {

        userId:

          data.user.id,

        roomId:

          getRoomId(),

      },

    );

    return data.user;

  })().finally(() => {

    signInPromise =

      null;

  });

return signInPromise;