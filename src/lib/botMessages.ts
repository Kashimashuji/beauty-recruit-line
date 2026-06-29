export type BotMessages = {
  welcome: string;
  registered: string;
  booking_confirmed: string;
};

export const DEFAULT_BOT_MESSAGES: BotMessages = {
  welcome:
    "友だち追加ありがとうございます！\n採用担当よりご連絡させていただきます。\n\nまず、通っている専門学校名を教えてください。\n（最初の2〜3文字を入力するだけで候補が表示されます）",
  registered:
    "登録完了です！ありがとうございました🎉\n\n見学・説明会の予約をご希望の方はボタンを押してください。",
  booking_confirmed:
    "ご予約ありがとうございます！\n\n📅 {date}\n📍 {store}\n\n当日お会いできるのを楽しみにしています。",
};

export function getMsg(settings: Partial<BotMessages>, key: keyof BotMessages): string {
  return settings[key] ?? DEFAULT_BOT_MESSAGES[key];
}
