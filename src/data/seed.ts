/**
 * Historical import: the hosts' own game notes, March–September 2026.
 * Every figure keeps its original text. Anything that needed interpretation is marked needs_review.
 * Nothing here is invented; where a note was ambiguous the record says so instead of guessing.
 */
import type { Attendance, Category, DB, Distribution, FinancialEntry, Game, Player, Settings, Verification } from "../types";
import { durationFromTimes } from "../lib/finance";
import { norm } from "../lib/names";

const HOSTS = ["Jett", "Maddox"];

export const DEFAULT_SETTINGS: Settings = {
  businessName: "Cambo Poker",
  hosts: HOSTS,
  split: { Jett: 0.5, Maddox: 0.5 },
  currency: "AUD",
  dealerPaidFromRakeByDefault: false,
  reconcileTolerance: 1,
};

type V = Verification;
interface E { cat: Category; amount: number | null; text: string; v?: V; deduct?: boolean; notes?: string }
interface Dst { recipient?: string; amount: number | null; text: string; v?: V; pooled?: boolean; notes?: string }
type Att = string | [string, string]; // name | [name, note]
interface N {
  date: string | null; odt: string; start?: string; finish?: string; hours?: number;
  dealer?: string; dealerIsPlayer?: boolean;
  players: Att[]; entries: E[]; dist?: Dst[]; notes?: string; review?: string[]; source: string;
}

const rake = (amount: number | null, text: string, v: V = "verified", notes?: string): E => ({ cat: "rake", amount, text, v, notes });
const food = (amount: number | null, text: string, v: V = "verified", notes?: string): E => ({ cat: "food", amount, text, v, notes });
const drinks = (amount: number | null, text: string, v: V = "verified", notes?: string): E => ({ cat: "drinks", amount, text, v, notes });
const other = (amount: number | null, text: string, v: V = "verified", notes?: string): E => ({ cat: "other_expense", amount, text, v, notes });
const adj = (amount: number | null, text: string, v: V = "needs_review", notes?: string): E => ({ cat: "adjustment", amount, text, v, notes });
const dealer = (amount: number | null, text: string, v: V = "verified", notes?: string): E => ({ cat: "dealer_earnings", amount, text, v, deduct: false, notes });
/** "$X each" → one share row per host. */
const each = (amount: number, text: string, v: V = "verified", notes?: string): Dst[] =>
  HOSTS.map((h) => ({ recipient: h, amount, text, v, notes }));
const pooled = (amount: number | null, text: string, v: V = "needs_review", notes?: string): Dst[] => [
  { recipient: "Hosts (pooled)", amount, text, v, pooled: true, notes },
];

const NIGHTS: N[] = [
  {
    date: "2026-03-20", odt: "20/03", start: "7pm",
    players: ["Ethan", "Harry", "Harry's friend", "Kailob", ["Fredo", "coming 9pm"], ["Chris", "Adam friend"], "Lucas", "Adam", "Becker"],
    entries: [rake(775, "$775 rake")],
    dist: each(311.5, "$311.5 profit each", "needs_review", "Same note also says '$500 profit': conflicting."),
    review: ["Note gives '$500 profit' AND '$311.5 profit each' (= $623 for two). The two figures conflict and $775 − $623 = $152 of costs is unexplained.",
      "Year not written: 2026 assumed from the following games."],
    source: "Poker 7pm - 20/03\nEthan\nHarry\nHarry's friend\nKailob\nFredo (coming 9pm)\nChris (Adam friend)\nLucas\nAdam\nBecker\n\n$775 rake, $500 profit ($311.5 profit each)",
  },
  {
    date: "2026-04-05", odt: "5/04/26", start: "8pm",
    players: ["Jakai", "Joel", "Kaliob", "Lucas", "Bun", "Zemin", "Hayden", "Eli"],
    entries: [rake(1251, "$1251 profit spilt", "needs_review", "Labelled 'profit', not 'rake'. Entered as rake because no expenses were listed.")],
    dist: pooled(1251, "$1251 profit spilt", "needs_review"),
    review: ["'$1251 profit split': unclear whether this was the rake or the amount after costs. No expenses written."],
    source: "Poker 8pm 5/04/26\nJakai\nJoel\nKaliob\nLucas\nBun\nZemin\nHayden\nEli\n\n$1251 profit spilt",
  },
  {
    date: "2026-04-11", odt: "11/04", start: "6pm",
    players: ["Kaliob", "Caleb", "Bun", "Lucas", "Adam", "Chris", "Amik"],
    entries: [rake(1326, "$1326"), food(107, "-107 food")],
    review: ["Year not written: 2026 assumed."],
    source: "Poker list 6pm 11/04\nKaliob\nCaleb\nBun\nLucas\nAdam\nChris\nAmik\n\n$1326 (-107 food) = profit then spilt",
  },
  {
    date: "2026-04-18", odt: "18/04/26", start: "8pm", hours: 5,
    players: ["Tristan", "Lucas", "Sam", ["Bun", "written as BunTha"], "Zac", "Ryan", "Dev", ["Adam", "LATE"]],
    entries: [rake(1247, "1247")],
    dist: pooled(1158.4, "(1158.4 profit)", "needs_review", "$88.60 below the rake with no expense written."),
    review: ["Profit $1,158.40 is $88.60 less than the $1,247 rake, but no expense was written down."],
    source: "Poker list 8pm 18/04/26\nTristan\nLucas\nSam\nBunTha\nZac\nRyan\nDev\n\nAdam LATE\n\n1247 (1158.4 profit) 5 hours (spilt)",
  },
  {
    date: "2026-04-25", odt: "25/04/26",
    players: ["Bun", "Ian", "Kaliob", "Hudson", "Chris", ["Paul", "leaves at 7pm"], "Brent", "Fredo", "Adam", "Mohammed", "Mohammad friend"],
    entries: [rake(2485, "$2485"), food(59.79, "food $59.79")],
    source: "Poker list 25/04/26\nBun\nIan\nKaliob\nHudson\nChris\nPaul (leaves at 7pm)\nBrent\nFredo\n\nAdam\nMohammed\nMohammad friend\n$2485, food $59.79 ,",
  },
  {
    date: "2026-05-03", odt: "3/05/26",
    players: ["Lucas", "Adam", "Fredo", "Chris", "Puru", "Kaliob", "Ian", ["Dad", "written as 'Dad???'"], "Caleb"],
    entries: [rake(1780, "$1780"), food(141, "$141 food")],
    notes: "3 people not eating.",
    review: ["'Dad???': uncertain whether this person attended."],
    source: "Poker list 3/05/26\nLucas\nAdam\nFredo\nChris\nPuru\nKaliob\nIan\nDad???\nCaleb\n\n$1780, $141 food 3 people not eating",
  },
  {
    date: "2026-05-04", odt: "4/05/26", start: "1pm", hours: 7,
    players: ["Sibar", "Lucas", "Kiaan", "Fredo", "Paul", ["Dan", "written as 'Nicole (Dan played)'"], "Adam", "Zemin"],
    entries: [rake(1834, "$1834 rake"), food(147.3, "Food $147.30")],
    source: "Poker 1pm 4/05/26\nSibar\nLucas\nKiaan\nFredo\nPaul\nNicole (Dan played)\nAdam\nZemin\n\n$1834 rake , Food $147.30, 7hours",
  },
  {
    date: "2026-05-08", odt: "08/05", start: "6pm", hours: 7,
    players: ["Lucas", "Puru", "Bun", "Huntz", "Braydon", "Maddox", "Zac", ["Adel", "late 8pm"], ["Humeed", "late 9pm"], ["Arsh", "came at 11:30pm"]],
    entries: [rake(1375, "$1375 rake"), food(177, "$177 gyg"), drinks(50, "Drinks $50"), drinks(25, "snacks $25"),
      adj(2, "maddox gave $2 for rake", "needs_review", "Unclear whether the $2 is already inside the $1375.")],
    review: ["Year not written: 2026 assumed.", "'Maddox gave $2 for rake': may already be included in the $1,375."],
    source: "Poker 6pm 08/05\nLucas\nPuru\nBun\nHuntz\nBraydon\nMaddox\nZac\nAdel (late 8pm)\nHumeed (late 9pm)\nArsh (came at 11:30pm)\n\nDrinks $50, snacks $25, $177 gyg , maddox gave $2 for rake, $1375 rake, 7 hours",
  },
  {
    date: "2026-05-09", odt: "09/05", start: "6pm", hours: 6,
    players: ["Bun", "Huntz", "Humeed", "Humeed friend", "George", "Tom", ["Jett or Maddox (unresolved)", "written as 'Jett / Maddox'"]],
    entries: [rake(1668, "Rake $1668"), food(62, "Food $62")],
    review: ["Year not written: 2026 assumed.", "Player list says 'Jett / Maddox': one of the hosts played, but which one is not recorded."],
    source: "Poker 6pm 09/05\nBun\nHuntz\nHumeed\nHumeed friend\nGeorge\nTom\nJett / Maddox\n\nFood $62, Rake $1668, 6hours",
  },
  {
    date: "2026-05-15", odt: "15/05/26", start: "5pm", hours: 8,
    players: [["Lucas", "leaves at 9pm"], "Chris", "Bun", "Ian", "Puru", "Matthew", "Huntz", "Tom", ["Paul", "9:30"]],
    entries: [rake(1949, "Rake $1949")],
    dist: pooled(1856, "$1856", "needs_review", "Second figure in the note; $93 below rake with no expense written."),
    review: ["Note reads 'Rake $1949, $1856, 8hrs': the $1,856 is assumed to be the amount split; the $93 gap is unexplained."],
    source: "Friday list 15/05/26 5pm\nLucas (leaves at 9pm)\nChris\nBun\nIan\nPuru\nMatthew\nHuntz\nTom\nPaul (9:30)\n\nRake $1949, $1856, 8hrs",
  },
  {
    date: "2026-05-22", odt: "22/05/26", start: "5pm", finish: "1:45am", dealer: "Ian L",
    players: ["Bun", "Tom", "Ian", "Lucas", "Kiaan", "Huntz", "Paul", "Hayden", "Peter", "Kaliob", "Caleb"],
    entries: [rake(1600, "rake $800 each", "needs_review", "'$800 each' × 2 hosts assumed = $1,600."), food(103, "Food $103"),
      dealer(725, "Ian made $725")],
    dist: each(800, "rake $800 each", "needs_review", "Unclear whether the $103 food was taken out before or after the $800 each."),
    review: ["'rake $800 each': total rake assumed to be $1,600 for two hosts; unclear whether food was deducted first."],
    source: "Poker list 22/05/26 5pm - 1:45am\nBun\nTom\nIan\nLucas\nKiaan\nHuntz\nPaul\nHayden\nPeter\nKaliob\nCaleb\n\nDealer: Ian L\n\nFood $103, rake $800 each, Ian made $725",
  },
  {
    date: "2026-05-23", odt: "23/05/26", start: "5pm", finish: "12am", dealer: "Adam", dealerIsPlayer: true,
    players: ["Bun", "Huntz", "Tom", "Karen", "Jett", "Maddox", "Charles"],
    entries: [rake(1230, "rake $615 profit each", "needs_review", "'$615 each' × 2 hosts assumed = $1,230."), food(62.7, "food $62.70"),
      dealer(480, "Adam dealt he made $480")],
    dist: each(615, "rake $615 profit each", "needs_review", "Unclear whether food was taken out first."),
    review: ["'rake $615 profit each': total assumed $1,230; unclear whether the $62.70 food was deducted first."],
    source: "Poker 23/05/26 5pm start\nBun\nHuntz\nTom\nKaren\nJett\nMaddox\nCharles\n\nFinished 12am, rake $615 profit each, food $62.70, Adam dealt he made $480",
  },
  {
    date: "2026-05-30", odt: "30/05/26", start: "2pm", finish: "9:30pm", dealer: "Adam", dealerIsPlayer: true,
    players: ["Brodie", "Brodie's friend", "Philip", "Bailey", "Lucas", "Chris", ["Bun", "written as buntha"], "Khalil", "Huntz"],
    entries: [rake(1600, "Rake $1600"), food(61, "$61 food"), dealer(430, "Adam made $430")],
    source: "Poker 2pm 30/05/26\n-brodie\n-brodie's friend\n-philip\n-bailey\n-lucas\n-chris\n-buntha\n-khalil\n-huntz\nDealer: Adam\n\nRake $1600, Adam made $430, $61 food, game finish 9:30pm",
  },
  {
    date: "2026-06-05", odt: "5/06/26", start: "5pm", dealer: "Ian L",
    players: ["Lucas", "Puru", "Bun", "Ian", "Paul", "Huntz", "Diego", "Kaliob"],
    entries: [rake(null, "Rake $600-700", "needs_review", "A range, not a figure. Enter the real amount."), food(150, "food $150"),
      adj(null, "$50 niki", "needs_review", "Not clear what this $50 was.")],
    review: ["Rake written as a range '$600-700'.", "'$50 niki': unknown whether this is an expense, a contribution, or something else."],
    source: "Poker fri 5/06/26 @5pm\n• Lucas\n• Puru\n• Bun\n• Ian\n• Paul\n• Huntz\n• Diego\n• Kaliob\n\nDealer: Ian L\nRake $600-700, food $150, $50 niki",
  },
  {
    date: "2026-06-12", odt: "12/06/26", start: "5pm", finish: "12am",
    players: ["Bun", "Ian", "Henry", "Lucas", "Jakai", "Huntz", "Max"],
    entries: [rake(1467, "Rake $1467"), food(70, "food $70")],
    source: "Poker 12/06/26 5pm\nBun\nIan\nHenry\nLucas\nJakai\nHuntz\nMax\nRake $1467, food $70, finish 12am",
  },
  {
    date: "2026-06-13", odt: "13/06/26", start: "2pm", finish: "8:30pm",
    players: ["Ian", "Bun", "Zemin", "Kye", "Paul", "Chris", "Nick", "Delvin", "Adel"],
    entries: [rake(1303, "Rake $1303"), food(107, "food $107")],
    dist: each(598, "$598 each"),
    source: "Poker 13/06/26 2pm\nIan\nBun\nZemin\nKye\nPaul\nChris\nNick\nDelvin\nAdel\n\nRake $1303, food $107, $598 each\nFinish 8:30pm",
  },
  {
    date: "2026-06-19", odt: "19/06/26", start: "5pm", hours: 7,
    players: ["Sibar", "Max", "Vince", "Sam", ["Chris (Asian)", "written as 'Chris (asain)'"], "Churchie", "Matthew", "Laurence", "Aleks", "Adel"],
    entries: [rake(2448, "$2448 rake"), food(70, "food $70"),
      other(50, "Sam $50", "needs_review", "Not clear what the $50 to/from Sam was. Treated as a deduction because '$1164 each' then reconciles.")],
    dist: each(1164, "$1164 each"),
    review: ["'Sam $50': purpose unknown; entered as an expense because the split only reconciles with it deducted."],
    source: "Poker 19/06/26\n\nFriday Poker 5pm:\n-Sibar\n-Max\n-Vince\n-Sam\n-Chris (asain)\n-Churchie\n-Matthew\n-Laurence\n-Aleks\n-Adel\n\n$2448 rake, food $70, Sam $50, $1164 each 7 hrs",
  },
  {
    date: "2026-06-27", odt: "27/06/26", start: "2pm", finish: "8:30pm",
    players: ["Bun", "Huntz", "Anton", "Charles", "George", "Jake", "Jett", "Maddox", "Delvin"],
    entries: [rake(1190, "1190 profit", "needs_review", "Labelled 'profit', not 'rake'. No expenses written.")],
    dist: each(595, "$595", "needs_review"),
    review: ["'1190 profit, $595': unclear whether $1,190 was the rake or the amount after costs."],
    source: "Poker 27/06/26 2pm\nBun\nHuntz\nAnton\nCharles\nGeorge\nJake\nJett\nMaddox\nDelvin\n\n1190 profit , $595, 8:30pm finish",
  },
  {
    date: "2026-07-03", odt: "3/07/26", start: "5:20pm", finish: "3:30am", dealer: "Dominick",
    players: ["Bun", "Huntz", "Paul", "Jakai", "Joel", "Ian", "Sibar", "Tom", "Khalil"],
    entries: [rake(2100, "$2100 total rake"), food(102.54, "Food $102.54"), drinks(60, "24 pack, $60"),
      adj(30, "Ian food $26.81 gave $30", "needs_review", "Ian paid $30 towards his own $26.81 food."),
      dealer(1000, "$1000 dealer")],
    dist: each(1050, "$1050 each", "needs_review", "$1,050 each = the full $2,100 rake, so food, drinks and dealer were not deducted in the split."),
    review: ["Split '$1050 each' equals the whole rake: expenses and the $1,000 dealer were apparently not taken out of the split."],
    source: "Friday 5pm 3/07/26(5:20pm start)\nBun\nHuntz\nPaul\nJakai\nJoel\nIan\nSibar\nTom\nKhalil\n\nDealer: Dominick\nFood $102.54 , Ian food $26.81 gave $30, 24 pack, $60, $1000 dealer, $1050 each, $2100 total rake. Game break 3:30am",
  },
  {
    date: "2026-07-04", odt: "4/07/26", start: "4pm", finish: "12:30am", dealer: "Ian L",
    players: ["Bun", "Ian", "Millsy", "Jake", "Kingsley", "Sibar", "Lucas", "Tom", "Karen", "Matthew"],
    entries: [rake(1212, "Rake $1212"), food(177, "Food $177"), food(46.55, "+ 46.55"), dealer(860, "Ian 860")],
    dist: each(606, "$606 each", "needs_review", "$606 each = the full rake; food not deducted in the split."),
    review: ["Split '$606 each' equals the whole $1,212 rake: the $223.55 food was not taken out of the split."],
    source: "Saturday poker 4/07/26 4pm game\n· Bun\n· Ian\n· Millsy\n· Jake\n· Kingsley\n· Sibar\n· Lucas\n· Tom\n· Karen\n· Matthew\n\nDealer: Ian L\n\nFood $177 + 46.55\nRake $1212, $606 each , Ian 860\n12:30am finish",
  },
  {
    date: "2026-07-10", odt: "10/07/26", start: "6pm", finish: "12:30am", dealer: "Hosts",
    players: ["Bun", "Tom", "Max", "Lucas", "Sibar", "Matthew", "Khalil", "Hussey", "Paul", "Jack W"],
    entries: [rake(2118, "Rake $1059 each", "needs_review", "'$1059 each' × 2 hosts assumed = $2,118."), food(62, "Food $62")],
    dist: each(1059, "Rake $1059 each", "needs_review"),
    notes: "Dealer: us. Someone bringing chips from home: extra $100 and missing two 1's. Someone in that list is cheating us.",
    review: ["'Rake $1059 each': total assumed $2,118; unclear whether food was deducted first.", "Note reports an extra $100 of chips and two missing $1 chips: possible cheating."],
    source: "Friday game 6pm 10/07/26\n• Bun\n• Tom\n• Max\n• Lucas\n• Sibar\n• Matthew\n• Khalil\n· Hussey\n· Paul\njack w\n\nDealer: us\n\nFood $62, Rake $1059 each\nSomeone bringing chips from home , extra $100 and missing two 1's\n\nSomeone in that list is cheating us\n\nGame break 12:30am",
  },
  {
    date: "2026-07-25", odt: "25/07/26",
    players: ["Bun", "Puru", "Lucas", "Tom", "Tom friend", "Jake", "Freddy", "Becker", "Daniel", "Lea"],
    entries: [rake(1415, "$1415 total"),
      adj(null, "Freddy $200", "needs_review", "Unknown what the $200 relates to."),
      other(175, "Tom's smokes & our vapes $175", "needs_review", "Not deducted in the '$707 each' split: unclear if it was a business cost.")],
    dist: each(707, "$707 each", "needs_review", "$707 × 2 = $1,414 ≈ the full $1,415; the $175 was not taken out."),
    review: ["'Freddy $200': purpose unknown.", "'Tom's smokes & our vapes $175' noted but the split used the full $1,415."],
    source: "Poker 25/07/26\nBun\nPuru\nLucas\nTom\nTom friend\nJake\nFreddy\nBecker\nDaniel\nLea\n\nFreddy $200, Tom's smokes & our vapes $175. $1415 total. $707 each",
  },
  {
    date: "2026-08-01", odt: "01/08/26", start: "4pm", dealer: "Ian L",
    players: ["Tom", "Bun", "Karen", "Sibar", "Ian", "Lucas", "Seth", "Rohan", "Peter", "Jake"],
    entries: [rake(2168, "Rake $1084 each", "needs_review", "'$1084 each' × 2 hosts assumed = $2,168."), dealer(950, "Dealer made $950")],
    dist: each(1084, "Rake $1084 each", "needs_review"),
    review: ["'Rake $1084 each': total assumed $2,168. No expenses written."],
    source: "Saturday 4pm 01/08/26 game list:\n· Tom\n· Bun\n· Karen\n· Sibar\n· Ian\n· Lucas\n· Seth\n· Rohan\nPeter\nJake\n\nDealer: Ian L\nRake $1084 each\nDealer made $950",
  },
  {
    date: "2026-08-07", odt: "7/08/26", start: "5pm", dealer: "Ian",
    players: ["Lucas", "Khali", "Tom", "Bun", "Jakai", "Kye", "Seth", "Jake", "Puru"],
    entries: [rake(1475, "Rake $1475"), food(200, "Food $200 ish", "needs_review", "Approximate."), dealer(850, "Ian dealer: $850")],
    dist: pooled(1241, "Profit $1241", "needs_review", "1475 − 200 = 1275, not 1241."),
    review: ["Food is approximate ('$200 ish').", "Recorded profit $1,241 does not match rake − food ($1,275).", "Dealer written as 'Ian': may be Ian L."],
    source: "Poker 5pm 7/08/26\nLucas\nKhali\nTom\nBun\nJakai\nKye\nSeth\nJake\nPuru\n\nRake $1475, Food $200 ish. Profit $1241. Ian dealer: $850",
  },
  {
    date: "2026-09-04", odt: "4/09/26", start: "5pm", finish: "12:30am",
    players: ["Lucas", "Bun", "Hussey", "Chris", "Delvin", "Max", "Jake", "Puru"],
    entries: [rake(2215, "2215")],
    dist: each(1084, "$1084 each", "needs_review", "$2,168 for two; $47 below the rake with no expense written."),
    review: ["Lucas appears twice in the list: counted once.", "Split $1,084 each = $2,168, which is $47 below the $2,215 rake with no expense written."],
    source: "Poker 4/09/26 5pm start end 12:30am\nLucas\nBun\nHussey\nChris\nDelvin\nMax\nLucas\nJake\nPuru\n\n2215\n$1084 each",
  },
  {
    date: "2026-09-12", odt: "12/09/26", start: "2pm", finish: "9pm",
    players: ["Bun", "Karen", "Puru", "Tom", "Jacob", "Phil", "Seth", "Sri"],
    entries: [rake(2188, "Rake: $2188")],
    dist: each(1122.5, "1122.5 each", "needs_review", "$2,245 for two is MORE than the $2,188 rake."),
    review: ["Split $1,122.50 each = $2,245, which is more than the $2,188 rake."],
    source: "Saturday list @2pm 12/09/26 9pm finish\n• Bun\n• Karen\n• Puru\n• Tom\n• Jacob\n• Phil\n• Seth\n• Sri\n\nRake: $2188\n1122.5 each",
  },
  {
    date: "2026-09-25", odt: "fri 5pm 25/10/26", start: "5pm", finish: "1am", dealer: "Hosts",
    players: ["Bun", "Hussey", "Tom", "Lucas", "Max", "Jake", "Diego"],
    entries: [rake(1518, "1518 rake"),
      adj(492, "dealer: 492", "needs_review", "Assumed to be dealer tips kept by the hosts, as the next game's note adds it to the total.")],
    dist: each(996, "$996 each profit", "needs_review"),
    review: ["Date written as 25/10/26 (a Sunday, note says fri). Corrected to 25/09/26, a Friday, by the hosts on 17 Oct 2026.",
      "'dealer: 492': assumed to be tips kept by the hosts (1518 + 492 − 18 ≈ 2 × 996); $18 unexplained."],
    source: "Poker fri 5pm 25/10/26 1am finish\nBun\nHussey\nTom\nLucas\nMax\nJake\nDiego\n\n1518 rake , dealer: 492, $996 each profit",
  },
  {
    date: null, odt: "Poker sat 2pm (no date written)", start: "2pm", finish: "9:10pm", dealer: "Hosts",
    players: ["Bun", "Hussey", "Tom", "Lucas", "Diego", "Dev", "Sri", "Puru", "Becker"],
    entries: [rake(1557, "Rake $1557"), adj(498, "498 (Total $2055)", "verified", "Note adds it to the rake: 1557 + 498 = 2055."), food(62, "-62 food")],
    dist: each(996, "$996 each"),
    review: ["No date on this note. It follows the Friday 25/09 note, so it is probably the next day: confirm."],
    source: "Poker sat 2pm finish 9:10pm\nBun\nHussey\nTom\nLucas\nDiego\nDev\nSri\nPuru\nBecker\n\nRake $1557 , 498\nTotal $2055 -62 food = 1993\n\n$996 each",
  },
];

const PLAYER_NOTES: Record<string, string> = {
  Kailob: "Only on 20/03. Possibly the same person as Kaliob: spelling differs, not merged.",
  Khali: "Only on 7/08. Possibly Khalil: not merged.",
  "Chris (Asian)": "Listed separately from Chris on 19/06, so kept as a separate person.",
  "Jett or Maddox (unresolved)": "09/05 list said 'Jett / Maddox'. Reassign this attendance once you know which host played.",
  Dad: "Written as 'Dad???' on 3/05: attendance uncertain.",
  Dan: "Played in Nicole's spot on 4/05.",
};

export function buildSeed(): DB {
  const players: Player[] = HOSTS.map((h) => ({ id: `p-${norm(h)}`, name: h, aliases: [], notes: "Host and business owner.", isHost: true }));
  const pid = (name: string): string => {
    const key = norm(name);
    let p = players.find((x) => norm(x.name) === key || x.aliases.some((a) => norm(a) === key));
    if (!p) {
      p = { id: `p-${key.replace(/[^a-z0-9]+/g, "-")}`, name, aliases: [], notes: PLAYER_NOTES[name] ?? "", isHost: false };
      players.push(p);
    }
    return p.id;
  };
  pid("Bun"); players.find((p) => p.name === "Bun")!.aliases.push("BunTha", "Buntha");

  const games: Game[] = [], attendance: Attendance[] = [], entries: FinancialEntry[] = [], distributions: Distribution[] = [];
  NIGHTS.forEach((n, i) => {
    const id = `g-${String(i + 1).padStart(2, "0")}`;
    const computed = n.start && n.finish ? durationFromTimes(n.start, n.finish) : null;
    const duration = n.hours ?? computed;
    games.push({
      id, date: n.date, originalDateText: n.odt, startTime: n.start ?? "", finishTime: n.finish ?? "",
      durationHours: duration, durationSource: n.hours != null ? "recorded" : computed != null ? "computed" : null,
      dealerPlayerId: n.dealer && n.dealerIsPlayer ? pid(n.dealer) : null, dealerName: n.dealer ?? "",
      notes: n.notes ?? "", sourceText: n.source, reviewNotes: n.review ?? [],
    });
    const seen = new Set<string>();
    for (const a of n.players) {
      const [name, note] = Array.isArray(a) ? a : [a, undefined];
      const p = pid(name);
      if (seen.has(p)) continue;
      seen.add(p);
      attendance.push({ gameId: id, playerId: p, notes: note });
    }
    n.entries.forEach((e, k) =>
      entries.push({ id: `${id}-e${k + 1}`, gameId: id, category: e.cat, amount: e.amount, originalText: e.text,
        verification: e.v ?? "verified", deductFromRake: e.cat === "dealer_earnings" ? !!e.deduct : undefined, notes: e.notes }),
    );
    (n.dist ?? []).forEach((d, k) =>
      distributions.push({ id: `${id}-d${k + 1}`, gameId: id, recipient: d.recipient ?? "Hosts (pooled)", amount: d.amount,
        type: d.pooled ? "pooled_total" : "recipient_share", originalText: d.text, verification: d.v ?? "verified", notes: d.notes }),
    );
  });
  return { version: 1, settings: DEFAULT_SETTINGS, games, players, attendance, entries, distributions, transactions: [] };
}
