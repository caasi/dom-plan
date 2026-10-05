# dom-plan：一個延後執行的 jQuery 子集（設計草稿 v4）

狀態：草稿 v4，2026-10-05。已實作在本 repo（28 項 jsdom 單元檢查、21 項瀏覽器 e2e）。套件名稱 `@caasi/dom-plan`。**程式碼以 `src/index.ts` 為準**，本文件只記決定與理由。
歷史：v1、v2.1、v3 各經一輪 Fable review。v3 的主要變動是**步驟模型**（第 4 節）。v3.1 依 user 的決定（D19-D22）與 v3 review 修正；v3.2 改名為 `Plan`（D19）並依 v3.1 review 修正。v4 依 spike 的發現，把 `or` 拆成 jQuery 的 `add`、`end` 與新的 `also`（D25）。第 12 節列出四輪 review 的處理狀態與 v4 的變更。

## 0. 核心思想

受 jQuery 啟發，為 DOM 提供一層 monadic 介面的 lazy、輕量操作語言。

- **jQuery 啟發**：chain style、步驟模型（`pushStack`）、委派規則照抄 jQuery。
- **monadic**：選取是以 list 為基礎的 monad；效果像 Writer 一樣跟著走；`run` 是唯一的出口。
- **lazy**：建計畫不碰 DOM，`run` 才執行。何時離開 lazy 由使用者決定（D21）。
- **輕量**：一個類別、一個步驟陣列；DOM 行為照原生 API（D20），不追求完美包裝。

## 1. 目標

- jQuery 的子集，用來**增強一頁現成的 HTML**。只針對 DOM，不做通用的樹語言（D23）。
- 一個值 = 一份延後執行的**計畫**：選取元素、累積效果、也能從零建樹。在 `run` 之前什麼都不發生（Haskell `runIO` 的思路）。
- chain style，每一步回傳新的 instance；對外的值 immutable（型別層級的 `readonly`）。
- 照 Paul Hudak 的作法：能用 list 與函式表達就不新增型別。計畫就是一個步驟陣列。
- TypeScript，架構好懂、不膨脹。核心估計一兩百行以內（未驗證）。

## 2. 非目標

通用的樹（hast、不可變樹）、單一狀態來源（Model）、虛擬 DOM、morph、全域訂閱、`Msg` 分派、跨 `run` 的 continuation、非同步的包裝、window 層級的事件（`resize`、window 的 `scroll`）。

## 3. 決定

| #   | 決定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 由誰決定                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| D1  | 事件用委派，事件觸發時才解析 selector                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | user                                                    |
| D2  | 綁定在 `mount` 時宣告並複製（陣列與每個 tuple），之後不變；`mount` 時驗證每個 selector；`mount` 回傳 unmount 函式                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | agent（Fable S2、P2、v3 #8），user 未反對               |
| D3  | 命令式副作用與 DOM 改寫同為描述，只有 `run` 執行                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | user                                                    |
| D4  | 不要另外的 immutable tree、不要 morph；`run` 直接對 live DOM 套用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | agent，user 未反對                                      |
| D5  | **出口只有 `run(root)`**：重播所有步驟，回傳最後一步的元素陣列                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | user                                                    |
| D6  | chain style，每一步回傳新的 instance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | user                                                    |
| D7  | 空 selection 不做事                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | user                                                    |
| D8  | **步驟模型**：每個選取步驟從**上一步拿到手的元素**算出新集合，只在 `run` 時算一次；效果作用在當下這一步的集合上。效果看得到前面對 DOM 的改動，但「選到哪些元素」在該步就固定。等同 jQuery 的 `pushStack`，只是延後到 `run` 才重播                                                                                                                                                                                                                                                                                                                                                                      | user                                                    |
| D9  | 每個選取步驟之後去重複並排成**文件順序**（`compareDocumentPosition`），照 jQuery `uniqueSort`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | user                                                    |
| D10 | 委派逐層比對 `event.target` 到 root（不含）之間的每個祖先，內層先執行；同層依綁定順序；`stopPropagation` 停止外層                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | user                                                    |
| D11 | 委派不比對 root 本身                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | user                                                    |
| D12 | 不冒泡事件照 jQuery 改綁（`focus`→`focusin`、`blur`→`focusout`、`mouseenter`→`mouseover`、`mouseleave`→`mouseout`、`pointerenter`→`pointerover`、`pointerleave`→`pointerout`）；enter/leave 用 `relatedTarget` 模擬。依原生型別分組，一個原生型別只裝一個 listener                                                                                                                                                                                                                                                                                                                                     | user                                                    |
| D13 | **closure 裡的副作用：不阻止，使用者要知道自己在做什麼。** handler、`tap` 的 callback、`flatMap`／`filter` 的函式都是一般 closure，庫不檢查、不包裝、不阻擋其中的任何操作（寫 DOM、發請求、在 `tap` 裡 `run`、把元素存到外部）。型別也擋不住，這是刻意的，不是缺口。**範例的慣例**：handler 只呼叫 `e` 的方法並讀取值，其他副作用放進 `tap`；破例時在程式旁註明                                                                                                                                                                                                                                        | user                                                    |
| D14 | ~~`or` 的共同前段只執行一次~~：v4 拿掉 `or`，此決定作廢（D25）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | user                                                    |
| D15 | 不提供 Rust 式的拆包函式；`run` 回傳普通陣列，沒有效果的計畫跑 `run` 就是純讀取                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | agent，user 未反對                                      |
| D16 | 效果原語叫 `tap`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | user                                                    |
| D17 | 不支援 `stopImmediatePropagation`：同層其餘 handler 照樣執行。呼叫它仍會設 `cancelBubble`，所以外層會停                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | user                                                    |
| D18 | handler 收到原生事件，不改寫：綁 `focus` 收到 `e.type === 'focusin'`；被比對到的元素是第二個參數 `el`。`e.currentTarget` **只在 handler 執行期間**保證是 root；handler 回傳後的值沒有保證：真實使用者事件在每個 listener 之後就跑 microtask，所以計畫執行時仍是 root，`dispatchEvent`／`el.click()` 則是 `null`。`tap` 需要 root 時，在 handler 裡先存到 `const`                                                                                                                                                                                                                                       | user（`currentTarget` 部分為 Fable S3、v3 #4、v3.1 #2） |
| D19 | 套件 `@caasi/dom-plan`；入口就是類別 `Plan` 的靜態方法（`Plan.all`、`Plan.from`、`Plan.create`、`Plan.none`），不另外匯出入口物件。理由：agent 看到 `$` 會套用 jQuery「立即執行」的心智模型；`Plan` 讓型別、入口、文件同一個詞，並提醒要 `run`                                                                                                                                                                                                                                                                                                                                                         | user                                                    |
| D20 | 從零建樹：`Plan.create(tag)` 是一份計畫，起點是新建的元素。`append(child)` 對每個目標各 `run` 一次 `child`（以目標為 root），把回傳的元素交給原生 `Element.append`：**行為照 DOM API**，已在文件中的節點會被搬移，庫不另外過濾或複製                                                                                                                                                                                                                                                                                                                                                                   | user                                                    |
| D21 | **不規定非同步的寫法，不追求完美包裝。** 使用者可以多次建計畫、多次 `run`，也可以在 `tap` 或 `fetch().then()` 裡 `run`；何時離開 lazy 由使用者決定。計畫裡不出現 Promise                                                                                                                                                                                                                                                                                                                                                                                                                               | user                                                    |
| D22 | **不合併**：每個 handler 回傳的計畫各排一個 microtask，依呼叫順序（內層先、同層依綁定順序）執行。一個計畫丟錯，不影響其他計畫                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | user                                                    |
| D23 | 只針對 DOM，不做通用樹                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | user                                                    |
| D24 | 效果方法照原生 API 的行為：`addClass('a b')` 會在 `run` 時丟 `InvalidCharacterError`（`DOMTokenList` 不接受空白），不幫使用者切字串                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | user（Fable v3 #6，照 D20 的原則）                      |
| D25 | **拿掉 `or`，照 jQuery 拆成三個**：`add(css)` 聯集一個 selector（jQuery `.add`，只收選取、不收帶效果的 Plan）；`end()` 回到上一步的集合（jQuery `.end`，`exec` 用堆疊實作 `prevObject`）；`also(next)` 在同一次 `run` 裡接著執行 `next`，回傳 `next` 的元素。理由：spike 的兩個範例共 11 處 `or` 全是「依序執行」，沒有一處是聯集；而 `or` 同時扛聯集、依序、共同前段三件事，設計者自己都在天氣 app 寫錯（守衛被從 root 起算的分支繞過）。`also` 是 jQuery 沒有的，因為 jQuery 立即執行，兩行敘述就是依序；lazy 才需要它。所有 Plan 都從起點開始（建構子 private），所以 `next` 不會接續 `this` 的集合 | user                                                    |
| D26 | **不做效果順序的組合**（排程、交錯、非同步的順序）：那需要 lazy stream。`also` 只是步驟串接（Writer 的 monoid 串接），照寫的順序執行                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | user                                                    |

## 4. 核心：計畫就是步驟陣列

程式碼見 `src/index.ts`（137 行實際程式碼，不含註解與空行）。結構：

- `Step` 只有三種：`q`（選取，從上一步的集合算出新集合）、`fx`（效果，作用在當下集合的每個元素）、`end`（回到上一步的集合）。
- `exec(steps, root)` 依序處理步驟；每個 `q` 步驟前把當下集合推進堆疊，`end` 時彈出（jQuery 的 `prevObject`）；每個 `q` 之後去重複並排成文件順序（D9）。
- `Plan` 只有一個欄位 `steps`（private）。起點：`Plan.all`、`Plan.from`、`Plan.create`、`Plan.none`。選取：`flatMap`、`find`、`filter`、`closest`、`first`、`add`、`end`。接續：`also`。效果：`tap` 與一行包裝（`addClass`、`removeClass`、`toggleClass`、`attr`、`removeAttr`、`setText`、`remove`、`append`）。出口：`run(root)`。
- 不能有名為 `then` 的方法（Fable v3 #2：會讓 Plan 成為 thenable）。

### 用法

```ts
// removeClass then addClass act on the same held set (D8)
Plan.all('.a').removeClass('a').addClass('b').run(document)

// build a tree from zero (D20); each append builds a fresh copy
const item = (id: string, text: string) =>
  Plan.create('li')
    .attr('data-id', id)
    .addClass('todo')
    .append(Plan.create('input').attr('type', 'checkbox'))
    .append(Plan.create('span').addClass('title').setText(text))

Plan.all('ul.todos').append(item(id, text)).run(document)

// a plan with no effects is a plain read (D15)
const [first] = Plan.all('.chart').run(document)
```

### 語意說明

- **monad 是選取那一半。** 只含選取步驟的計畫是 `root → 有序集合` 的函式：`flatMap` 結合律、右單位律成立。效果步驟像 Writer 一樣跟著走；`also` 是 Writer 的 monoid 串接。right zero 不成立：`Plan.all('p').addClass('x').filter(() => false)` 與 `Plan.none` 都回傳 `[]`，但前者會加 class。
- **`Plan.from(el)` 不是 `return`**：它多檢查 `r.contains(el)`。
- **計畫是查詢，不是結果集合**：`run` 兩次會重新選取、重新執行效果。
- **`append` 的 child** 回傳的是**最後一步**的元素；以目標為 root，所以 `append(Plan.all('.x'))` 是把目標底下的 `.x` 搬到目標最後面。
- **建樹的劇本在節點未接進文件時執行**，`focus` 等需要節點在文件中的操作在劇本裡無效。
- **`closest` 與 `flatMap` 可能選到 root 以外的元素**；jQuery 也是這樣。
- **依序動兩組元素用 `also`**：`Plan.from(btn).closest('li').remove().also(count)`，`remove` 先執行，`count` 後執行。
- **守衛要用 `end` 分支，不要用 `also` 開新的起點**：`guarded.find('.days').setText('').end().find('.place').setText(p)`。`also(Plan.all(...))` 從 root 重新選取，會繞過守衛（spike 在天氣 app 實際踩到）。
- **要接上多個新的子元素，串接 `append`**：`days.reduce((p, d) => p.append(item(d)), forecast.find('.days').setText(''))`。
- **`Plan.from(el)` 在 `el` 被移除後回傳 `[]`**（不在 root 下）。

## 5. 委派

```ts
type Handler = (e: Event, el: Element) => Plan | void
type Binding = readonly [event: string, selector: string, handler: Handler]

const DELEGATE: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
  mouseenter: 'mouseover',
  mouseleave: 'mouseout',
  pointerenter: 'pointerover',
  pointerleave: 'pointerout',
}
const ENTER_LEAVE = new Set(['mouseenter', 'mouseleave', 'pointerenter', 'pointerleave'])
const nativeOf = (t: string) => DELEGATE[t] ?? t

export function mount(root: ParentNode, bindings: readonly Binding[]): () => void {
  const table = bindings.map((b): Binding => [...b]) // D2
  for (const [, css] of table) root.querySelector(css) // D2: throws here, not at the first event
  const ac = new AbortController()
  for (const native of new Set(table.map(b => nativeOf(b[0])))) {
    // D12
    root.addEventListener(
      native,
      e => {
        if (e.type === 'click' && (e as MouseEvent).button >= 1) return
        for (
          let n = e.target as Node | null;
          n && n !== root && !e.cancelBubble;
          n = n.parentNode
        ) {
          // D10, D11
          if (n.nodeType !== 1) continue
          const el = n as Element
          if (e.type === 'click' && (el as HTMLButtonElement).disabled === true) continue
          for (const [t, css, h] of table) {
            if (nativeOf(t) !== native || !el.matches(css)) continue
            if (ENTER_LEAVE.has(t)) {
              const rel = (e as MouseEvent).relatedTarget as Node | null
              if (rel && el.contains(rel)) continue
            }
            const p = h(e, el)
            if (p)
              queueMicrotask(() => {
                p.run(root)
              }) // D22: no merging
          }
        }
      },
      { signal: ac.signal },
    )
  }
  return () => ac.abort()
}
```

## 6. 非同步（D21）

庫不規定寫法。天氣 app 的 spike 採最直接的寫法：handler 讀值；請求在 `tap` 裡、`data-req` 設好之後才發出；回應回來後在 `then` 裡 `run`。

```ts
let seq = 0

const onSubmit: Handler = (e, form) => {
  e.preventDefault()
  const city = (form.querySelector('input') as HTMLInputElement).value
  const id = String(++seq) // Date.now() can repeat within 1 ms
  const forecast = Plan.all('#forecast').filter(el => (el as HTMLElement).dataset.req === id) // the guard
  return Plan.all('#forecast')
    .attr('data-req', id)
    .addClass('loading')
    .tap(() => {
      // starts after data-req exists
      fetchForecast(city)
        .then(data =>
          forecast
            .removeClass('loading')
            .tap(el => render(el, data))
            .run(document),
        )
        .catch(() => forecast.removeClass('loading').addClass('error').run(document))
    })
}
```

- 請求必須在 `tap` 裡發出：若在 handler 裡直接發出，而 promise 已經 settle（快取、空字串直接 reject、測試裡的 `Promise.resolve`），`then` 會比 `mount` 排的計畫先執行，找不到 `data-req`，畫面停在 loading（Fable v3.1 #1）。放在 `tap` 也符合 D13 的慣例。
- race condition：request id 存在 DOM，舊回應被 `filter` 擋掉（stale 時是空集合，D7）。
- `#forecast` 必須在 mount 的 root 底下，因為 handler 回傳的計畫以 mount 的 root 執行。
- 另一種寫法是把回應以 `CustomEvent` 派發回元素，再由 binding 接手。這時派發事件的元素**不能是 mount 的 root**（D11）。spike 先不做這個寫法。

## 7. 和 Elm 的對照

|          | Elm                        | dom-plan                 |
| -------- | -------------------------- | ------------------------ |
| 狀態     | 獨立 `Model`               | DOM 本身                 |
| 更新     | 重算 `view`，虛擬 DOM 比對 | 只改被選到的節點         |
| 事件     | `Msg` + `update`           | 委派表，handler 回傳計畫 |
| 副作用   | `Cmd`，runtime 執行        | 計畫，`run` 執行         |
| 非同步   | `Cmd` 產生 `Msg`           | 不規定；使用者自己 `run` |
| 全域訂閱 | `Sub`                      | 無                       |

Elm 一欄依 agent 對 Elm 0.19 的理解，未回查文件。

## 8. jQuery 原始碼依據（jquery/jquery main，經 `gh api` 取得，2026-10-05）

| 決定               | jQuery 的做法                                                                                                                     | 位置                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D8                 | 選取方法呼叫 `pushStack`：以新的元素集合建新物件，`prevObject` 指向上一步；效果方法立即作用並 `return this`。沒有合併或最佳化規則 | `src/core.js` 57-67 行；`src/attributes/classes.js`                      |
| D9                 | `jQuery.uniqueSort` 以 `compareDocumentPosition` 排序並去重複                                                                     | `src/traversing.js` 65、91、180 行；`src/traversing/findFilter.js` 71 行 |
| D10、D11           | 從 `event.target` 往上走到 `this`（不含），每層比對所有委派 selector；`isPropagationStopped` 停止外層                             | `src/event.js` 約 304-316、350-398 行                                    |
| D12                | `focus`/`blur` 用 `focusin`/`focusout`；enter/leave 用 over/out，`relatedTarget` 檢查在每個 handleObj 的 `handle` 裡              | `src/event.js` 約 736、807-835 行                                        |
| 第 5 節 click 過濾 | 略過 `button >= 1` 的 click 與 disabled 元素上的 click                                                                            | `src/event.js` 約 355-366 行                                             |

## 9. 給使用者文件：和 jQuery 不同的地方

（取自 Fable v3 review 第 3 節，寫進日後的使用文件。）

- 在 `run` 之前什麼都不發生。
- `Plan.all('.a')` 在 `run` 時才選取；jQuery 的 `const $a = $('.a')` 是建立當下就固定的集合。
- 有 `end()`；沒有 `.prevObject`、`.addBack()`。`add` 只收 selector 字串，不收元素或 jQuery 物件。
- `also(next)` 是 jQuery 沒有的：lazy 才需要明寫「接著做」。
- 沒有讀值方法（`.text()`、`.attr(n)`、`.val()`、`.hasClass()`）：用 `run` 加一般 JS，或在 `tap` 裡讀。
- `addClass('a b')` 會丟錯（D24）。
- `filter` 只接受函式：`filter(el => el.matches('.done'))`。
- 不接受 HTML 字串；沒有 `.html()`。清空用 `setText('')`。
- `append` 的 child 以目標為 root（D20）。
- handler 回傳 `false` 會被忽略（falsy），不等於 `preventDefault()` + `stopPropagation()`。
- handler 收到 `(e, el)`；`this` 不是元素；`e.type` 是原生型別。jQuery 在委派 handler 裡把 `currentTarget` 設成被比對的元素、`delegateTarget` 設成 root；dom-plan 不改寫：`currentTarget` 是 root，被比對的元素是 `el`，而且 handler 回傳後 `currentTarget` 的值沒有保證（D18）。
- 沒有直接綁定（不帶 selector 的 `.on`）：root 本身永遠不被比對（D11），點在 root 本身的 click 不會到任何 handler。
- 不冒泡的事件（`load`、`error`、元素的 `scroll`、`toggle`、`invalid`、`play` 等）到不了 root，只有 D12 改綁的六個例外。jQuery 委派有同樣限制，但 jQuery 還有直接綁定。
- handler 回傳的計畫在該事件所有 handler 都被呼叫**之後**才執行；後面的 handler 看不到前面 handler 要做的 DOM 改動。jQuery 是立即改，後面的 handler 看得到。
- `append(child)` 有多個目標時，對每個目標各 `run` 一次 child；jQuery 是除了最後一個目標都複製。對 `create` 開頭的 child 結果相同，對 `append(Plan.all('.x'))` 不同。
- 沒有 `trigger`：在 `tap` 裡 `dispatchEvent(new CustomEvent(...))`。
- `stopImmediatePropagation` 不停止同層 handler（D17）。
- 沒有逐一解除綁定的 `off`；只有整個 unmount。
- `attr(n, v)` 只收字串；沒有 `prop`、`val`、`css`，用 `tap`。
- 另一個 listener 已經在 root 上呼叫 `stopPropagation` 時，dom-plan 不執行任何 handler（比 jQuery 嚴格）。
- binding selector 走 `Element.matches`：相對 selector（`> li`）在 `mount` 時丟 `SyntaxError`（D2）；`:scope` 指被比對的元素。

## 10. 未決問題

1. **元素逃逸**：屬於 D13，不阻止；寫進使用文件。
2. **錯誤處理**：無效的選取 selector 在 `run` 時才丟錯，同一個計畫剩下的步驟不執行；在 microtask 裡丟出時沒有指向建 chain 的 stack。binding selector 已在 `mount` 時驗證（D2）。handler 本身丟錯時，同一事件剩下的 handler 不會被呼叫（同一個 listener 迴圈；jQuery 相同）。
3. **passive listener**：root 是 `document` 或 `body` 時，瀏覽器可能把 `touchstart`、`wheel` 等當 passive。哪些事件預設 passive 未確認。
4. **`Element` 型別**：`run(document)[0].value` 需要轉型。先寫進文件，不加泛型。
5. **`docOrder` 對不在同一棵樹的節點**：順序由實作決定，三棵以上的樹之間是否有遞移性未確認。

## 10.5 之後再做（不在 spike 範圍）

- **generator 寫法（`Plan.gen`）**：用 `yield*` 當 do notation，在 `run` 時依序執行，每一步拿到手的元素集合當一個值傳回 generator。
  ```ts
  Plan.gen(function* () {
    const items = yield* Plan.all('li.todo') // Element[]
    yield* Plan.all('#count').setText(String(items.length))
  }).run(document)
  ```
  - 步驟模型裡每一步的集合是一個值，generator 只需往前跑一次，不用 burrido 那種重播。
  - 要讓 `yield*` 可用，`Plan` 需要 `[Symbol.iterator]`；這會讓 Plan 成為 iterable，要確認不會和 spread、`for...of` 的直覺衝突（v3 #2 的 thenable 問題是同一類風險）。
  - 會重新引入「依結果決定下一步」（v2 拿掉的 continuation），要和 D5、D21 一起重新評估。
  - 參考：`Effect.gen`（Effect v4 最小 bundle 約 57 KB gzip，2026-10-05 實測，太重不採用）、MobX `flow`、`pelotom/burrido`。

## 11. Spike

兩個 app（`examples/`），加上單元檢查（`test/`）。

- **Todo app**：新增（submit 時 `preventDefault`、讀輸入值、`append` + `create`）、勾選與刪除（委派到後來新增的項目）、全部／未完成／已完成篩選、剩餘數量（刪除時用 `or` 讓計數在移除之後執行，見第 4 節；`tap` 需要 root 時在 handler 裡先存）、雙擊編輯（`focus` 用 `run` 之後的一般 JS）。
- **天氣 app**：輸入城市 → geocoding → 預報 → 畫出列表；loading、錯誤、race 三種狀態（第 6 節的寫法）。API 預定用 Open-Meteo（免費、免 key，未查證現況與 `file://` 的 CORS）。

單元檢查（jsdom，除非標明「瀏覽器」）：

編譯：

- C1 `strict`、`target es2019`、`lib: ["es2019","dom","dom.iterable"]`：0 錯誤。若有錯，最可能在第 4 節起點步驟的參數型別推論。
- C2 拿掉 `dom.iterable`：NodeList spread 處報錯。
- C3 `lib` 降到 es2018：`flatMap` 處報錯。
- C4 `target es5`、無 `downlevelIteration`：報 TS2802 的位置是 `uniqSorted` 的 `Set` spread、`mount` 裡對 `Set` 的 `for...of`、`all` 與 `find` 的 NodeList spread。對陣列的 `for...of` 不報錯。

步驟模型與選取（fixture：`<section id=root><div id=c2><div id=c1><span></span></div><span></span><p></p><input></div></section>`）：

- R1 延後：建好計畫但未 `run`，DOM 不變；`run` 後才變。
- R2 D8 同步驟：`Plan.all('.a').removeClass('a').addClass('b')`，原本有 `a` 的元素現在有 `b`。
- R3 D8 跨步驟：`Plan.all('.a').removeClass('a').find('.err').setText('')`，原本 `.a` 底下的 `.err` 被清空。
- R4 `Plan.all('div').addClass('a').find('span').addClass('b')`，div 只有 a、span 只有 b。
- R5 `run` 回傳最後一步的元素；`Plan.all('p').remove().run(root)` 回傳被移除的 `p`。
- R6 D9：`Plan.all('span, p').closest('div')` 回傳 `[c2, c1]`。
- R7 D9 對照引擎：`Plan.all('span').add('div').run(root)` 等於同一個 root 上的 `[...root.querySelectorAll('div, span')]`。
- R8 `end` 回到上一步的集合；空的守衛經過 `end` 仍是空的，兩個部分都不執行。
- R9 `run` 同一個計畫兩次，效果重複。
- R10 `Plan.from(el)` 對不在 root 下的元素不作用；`Plan.from(root).run(root)` 回傳 root。
- R11 D7：空集合的 `tap` 不呼叫 callback；`first()` 對空集合回傳 `[]`。
- R12 D20：`append(item(...))` 對兩個目標各建一份；`create` 計畫直接 `run` 回傳一個未接上的元素；child 以選取步驟結尾時接上的是該步的元素。
- R13 無效 selector：建計畫不丟錯；`run` 丟 `SyntaxError`，後續步驟不執行。
- R14 `await Promise.resolve(plan)` 會 settle（`Plan` 沒有 `then`）。
- R15（v4 拿掉：`or` 已移除）
- R16 D24：`addClass('a b')` 在 `run` 時丟 `InvalidCharacterError`。

委派（合成事件一律 `bubbles: true`）：

- R17 mount 後新增的元素被點擊時 handler 被呼叫；`click()` 回傳當下 DOM 未變，`await null` 後已變。
- R18 D10：巢狀 `.outer`/`.inner`，綁定順序 `[outer, inner]`，點 `.inner` 的順序是 `[inner, outer]`；同一元素同時符合兩者時依綁定順序；inner 呼叫 `stopPropagation` 時 outer 不執行。
- R19 D12 跨型別：`focus` 綁 `.field`、`focusin` 綁 `input`，focus 到 input 時順序是 `[input, field]`；`blur`/`focusout` 同理（瀏覽器）。
- R20 D11：`mount(document, ...)` 時 `html` 會被比對，`document` 不會；selector 只符合 root 本身時不呼叫。
- R21 D17：同層兩個 handler，第一個呼叫 `stopImmediatePropagation`，第二個仍執行，外層不執行。
- R22 D18：綁 `focus` 收到 `e.type === 'focusin'`（瀏覽器）；handler 裡 `e.currentTarget === root`；**合成派發**（`dispatchEvent`）時，在 `tap` 裡讀 `e.currentTarget` 得到 `null`。
- R23 click 過濾：binding 放在 disabled button 的**祖先**上，對 button `dispatchEvent(new MouseEvent('click', { bubbles: true }))`，祖先的 handler 仍被呼叫，button 本身的 binding 不被呼叫；`button: 2` 的 click 一律不觸發。
- R24 enter/leave：合成 `mouseover` 在 `.box` 內子元素之間移動不觸發 `mouseenter` binding；從外面進來觸發；`relatedTarget: null` 觸發。
- R25 checkbox 的 click handler 呼叫 `preventDefault`，`click()` 回傳後 `checked === false`（jsdom 不支援時改瀏覽器）。
- R26 D22：兩層 handler 回傳有共同前段的計畫，前段跑兩次；同一個計畫物件被兩個 handler 回傳也跑兩次；一個計畫丟錯，另一個照常執行（檢查必須先裝 `process.once('uncaughtException', ...)` 或測試框架的 unhandled-error hook 接住錯誤，再斷言第二個計畫有執行）。
- R27 handler 回傳 `undefined` 不排任何東西；unmount 後不再觸發；`mount` 時給無效 selector 立即丟錯。
- R28 瀏覽器：真實點擊時兩個 `mount` 在同一個 root 上，第一個的 microtask 在第二個 listener 前執行；真實點擊時 `tap` 裡的 `e.currentTarget` 仍是 root；passive 的 `touchstart`；focus 事件需視窗有焦點。
- R29 `a.also(b)`：`a` 的效果先於 `b`；`run` 回傳 `b` 的元素。
- R30 `Plan.from(el)` 在 `el.remove()` 之後回傳 `[]`。
- R31 F12（瀏覽器）：`focus` binding 存在時，`tap(el => el.focus())` 在 `run` 中同步呼叫 handler，handler 的計畫在之後的 microtask 執行，不丟錯。
- R32 合成派發下兩個 `mount` 在同一個 root：兩個 listener 的 handler 都先被呼叫，之後才依序執行所有 microtask（對照 R28）。

jsdom 相依：R18、R21 需要 `cancelBubble` 反映 `stopPropagation`；R27 需要 `addEventListener` 的 `signal` 選項；R25 需要 checkbox 的取消啟動行為。檢查失敗時先確認 jsdom 是否支援，再判斷是不是庫的問題。

## 12. Review 處理狀態

### v1

| #   | 內容                              | 狀態                                                                       |
| --- | --------------------------------- | -------------------------------------------------------------------------- |
| F1  | `or` 共同前段跑兩次               | D14（範圍見 v3 #3）                                                        |
| F2  | 自我排程卡死                      | 消失：效果不回傳計畫。仍可在 `tap` 裡明寫 `run`，屬使用者自己的程式（D21） |
| F3  | `from` 不檢查 root                | 採用                                                                       |
| F4  | `mount` 不接受 `document`         | 採用                                                                       |
| F5  | 錯誤處理                          | 第 10 節                                                                   |
| F6  | handler 回傳 nothing              | 採用                                                                       |
| F7  | 多 binding 順序                   | 照 jQuery（D10）                                                           |
| F8  | `freeze` 只凍外層                 | 拿掉                                                                       |
| F9  | `mount` 保留參照                  | 採用（D2）                                                                 |
| F12 | `focus` 在 run 中同步觸發 handler | 不會重入：handler 只排 microtask                                           |
| F13 | passive                           | 第 10 節                                                                   |
| F14 | 跨 realm                          | `nodeType === 1`                                                           |

### v2.1

| #   | 內容                     | 狀態                                               |
| --- | ------------------------ | -------------------------------------------------- |
| M1  | 選取結果在 chain 中失效  | 步驟模型（D8）                                     |
| M2  | 依宣告型別各裝 listener  | 依原生型別分組                                     |
| M3  | R14 無效                 | 改測祖先（R23）                                    |
| S1  | `closest` 越出 root      | 第 4 節                                            |
| S2  | D2 淺複製                | 複製 tuple                                         |
| S3  | `currentTarget`          | D18（含 v3 #4）                                    |
| S4  | 先前已 `stopPropagation` | `!e.cancelBubble` 在迴圈條件；第 9 節              |
| P1  | `uniqSorted` 成本        | 不改，等量測                                       |
| P2  | unmount                  | 採用                                               |
| P3  | 合併同次派發             | 不合併（D22，user）                                |
| P4  | `first()`                | 採用                                               |
| P5  | `Element` 型別           | 第 10 節                                           |
| P6  | `toggleClass(c, force)`  | 採用                                               |
| P7  | handler 的 `root` 參數   | 拿掉；改用 `closest` 或先存 `currentTarget`（D18） |
| P8  | passive opt-out          | 第 10 節                                           |
| P9  | `nodeType === 1`         | 採用                                               |
| P10 | `matches` 的限制         | 第 9 節                                            |
| P11 | window 事件              | 非目標                                             |

### v3

| #   | 內容                                     | 狀態                                |
| --- | ---------------------------------------- | ----------------------------------- |
| 1   | D22 合併時共同前段找不到                 | 不合併（D22，user），合併程式碼刪除 |
| 2   | `private then` 讓 Plan 成為 thenable     | 改名 `step`；R14                    |
| 3   | D14 不可結合                             | 收窄 D14 的範圍；R8                 |
| 4   | `currentTarget` 在 microtask 裡是 `null` | 寫進 D18；R22                       |
| 5   | 派發事件的元素不能是 root                | 第 6 節                             |
| 6   | `addClass('a b')` 丟錯                   | 照原生行為（D24，user）；R16        |
| 7   | C4 預期錯誤位置                          | 已修正                              |
| 8   | `mount` 時驗證 selector                  | 採用（D2）；R27                     |
| 9   | `as unknown as Binding`                  | 拿掉                                |
| 10  | `rel === el` 多餘                        | 拿掉                                |
| 11  | `e.or(e)` 多一個空的 `or` 步驟           | 不改                                |

### v3.1

| #   | 內容                                                         | 狀態                                       |
| --- | ------------------------------------------------------------ | ------------------------------------------ |
| 1   | 第 6 節請求先於計畫，已 settle 的 promise 讓 UI 停在 loading | 請求移到 `tap` 裡（第 6 節）               |
| 2   | `currentTarget` 在真實事件的 microtask 裡仍是 root           | 修正 D18、第 9 節、R22、R28                |
| 3   | `or` 不排序不同樹的元素                                      | 第 4 節：用串接的 `append`；R15 不檢查順序 |
| 4   | 刪除後 `closest` 找不到 root                                 | 第 4 節：用 `or` 排序效果；R29、R30        |
| 5   | `Date.now()` 會重複                                          | 改用計數器                                 |
| 6   | R26 要接住 microtask 裡的錯誤                                | 修正 R26                                   |
| 7   | 第 9 節缺的差異                                              | 補上六條                                   |
| 8   | jsdom 相依                                                   | 列在第 11 節                               |
| 9   | handler 丟錯中止同事件其餘 handler                           | 第 10 節                                   |
| 10  | D14 措辭                                                     | 改為一般規則                               |
| 11  | `steps` 是 public                                            | 改 `private readonly`                      |
| 12  | `then` 沒有 `.catch`                                         | 第 6 節改用 `.then().catch()`              |
| 13  | focus 可以直接在 `tap` 裡做                                  | spike 採用                                 |
| 14  | 缺的單元檢查                                                 | R29-R32                                    |

### v4（spike 之後）

| 來源  | 內容                                                                                   | 處理                                              |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| spike | 天氣 app 的守衛被從 root 起算的 `or` 分支繞過，過期回應被畫出                          | `end()` 分支（D25）；R8；e2e race 檢查            |
| spike | 11 處 `or` 全是依序執行，沒有聯集                                                      | 拆成 `add`、`end`、`also`（D25）                  |
| spike | `also` 的「next 必須從起點開始」檢查永遠不會觸發                                       | 拿掉：由 private 建構子保證                       |
| spike | `assert.deepEqual` 比對 DOM 元素時比結構，不比身分                                     | 測試改用逐一身分比對；故意改壞 4 處確認檢查會失敗 |
| spike | TypeScript 7.0.2：`dom` 已含 iterable（C2 不報錯）；`target es5` 已移除（C4 無法執行） | C2、C4 的預期作廢                                 |
| user  | 效果順序的組合需要 lazy stream                                                         | 不做（D26）                                       |
