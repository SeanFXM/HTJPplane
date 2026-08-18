/**
 * Copyright (c) 2023-present the project authors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * 注册/登录页同步加载的日语翻译，确保新用户首次访问即显示日语
 */

export default {
  sidebar: {
    projects: "プロジェクト",
    pages: "ページ",
    new_work_item: "新規作業項目",
    home: "ホーム",
    your_work: "あなたの作業",
    inbox: "受信トレイ",
    workspace: "ワークスペース",
    views: "ビュー",
    analytics: "レポート",
    work_items: "作業項目",
    cycles: "サイクル",
    modules: "モジュール",
    intake: "インテーク",
    drafts: "下書き",
    favorites: "お気に入り",
    pro: "プロ",
    upgrade: "アップグレード",
    stickies: "付箋",
  },
  auth: {
    hotone_portal: {
      title: "Hotone Japan 業務運営センター",
      description: "社内のタスクと引き継ぎを一元管理",
      help: "社内アカウント専用です。ログインできない場合はワークスペース管理者へ連絡してください。",
    },
    common: {
      email: {
        label: "メールアドレス",
        placeholder: "name@company.com",
        errors: {
          required: "メールアドレスは必須です",
          invalid: "メールアドレスが無効です",
        },
      },
      password: {
        label: "パスワード",
        set_password: "パスワードを設定",
        placeholder: "パスワードを入力",
        confirm_password: {
          label: "パスワードの確認",
          placeholder: "パスワードを確認",
        },
        current_password: {
          label: "現在のパスワード",
        },
        new_password: {
          label: "新しいパスワード",
          placeholder: "新しいパスワードを入力",
        },
        change_password: {
          label: {
            default: "パスワードを変更",
            submitting: "パスワードを変更中",
          },
        },
        errors: {
          match: "パスワードが一致しません",
          empty: "パスワードを入力してください",
          length: "パスワードは8文字以上である必要があります",
          strength: {
            weak: "パスワードが弱すぎます",
            strong: "パスワードは十分な強度です",
          },
        },
        submit: "パスワードを設定",
        toast: {
          change_password: {
            success: {
              title: "成功！",
              message: "パスワードが正常に変更されました。",
            },
            error: {
              title: "エラー！",
              message: "問題が発生しました。もう一度お試しください。",
            },
          },
        },
      },
      unique_code: {
        label: "ユニークコード",
        placeholder: "123456",
        paste_code: "メールで送信されたコードを貼り付けてください",
        requesting_new_code: "新しいコードをリクエスト中",
        sending_code: "コードを送信中",
      },
      already_have_an_account: "すでにアカウントをお持ちですか？",
      login: "ログイン",
      create_account: "アカウントを作成",
      new_to_plane: "初めてご利用ですか？",
      back_to_sign_in: "サインインに戻る",
      resend_in: "{seconds}秒後に再送信",
      sign_in_with_unique_code: "ユニークコードでサインイン",
      forgot_password: "パスワードをお忘れですか？",
    },
    sign_up: {
      header: {
        label: "チームと作業を管理するためのアカウントを作成してください。",
        step: {
          email: {
            header: "サインアップ",
            sub_header: "",
          },
          password: {
            header: "サインアップ",
            sub_header: "メールアドレスとパスワードの組み合わせでサインアップ。",
          },
          unique_code: {
            header: "サインアップ",
            sub_header: "上記のメールアドレスに送信されたユニークコードでサインアップ。",
          },
        },
      },
      errors: {
        password: {
          strength: "強力なパスワードを設定して続行してください",
        },
      },
    },
    sign_in: {
      header: {
        label: "チームと作業を管理するためにログインしてください。",
        step: {
          email: {
            header: "ログインまたはサインアップ",
            sub_header: "",
          },
          password: {
            header: "ログインまたはサインアップ",
            sub_header: "メールアドレスとパスワードの組み合わせでログイン。",
          },
          unique_code: {
            header: "ログインまたはサインアップ",
            sub_header: "上記のメールアドレスに送信されたユニークコードでログイン。",
          },
        },
      },
    },
    forgot_password: {
      title: "パスワードをリセット",
      description:
        "確認済みのユーザーアカウントのメールアドレスを入力してください。パスワードリセットリンクを送信します。",
      email_sent: "リセットリンクをメールアドレスに送信しました",
      send_reset_link: "リセットリンクを送信",
      errors: {
        smtp_not_enabled: "変更については管理者までご連絡ください。",
      },
      toast: {
        success: {
          title: "メール送信完了",
          message:
            "パスワードをリセットするためのリンクを受信トレイで確認してください。数分以内に表示されない場合は、迷惑メールフォルダを確認してください。",
        },
        error: {
          title: "エラー！",
          message: "問題が発生しました。もう一度お試しください。",
        },
      },
    },
    reset_password: {
      title: "新しいパスワードを設定",
      description: "強力なパスワードでアカウントを保護",
    },
    set_password: {
      title: "アカウントを保護",
      description: "パスワードを設定して安全にログイン",
    },
    sign_out: {
      toast: {
        error: {
          title: "エラー！",
          message: "サインアウトに失敗しました。もう一度お試しください。",
        },
      },
    },
  },
  common: {
    join: "参加",
  },
} as const;
