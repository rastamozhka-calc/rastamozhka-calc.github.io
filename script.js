/*
    Rastamozhka Calc — расчёт предварительной стоимости растаможки

    Логика расчёта опирается на:
    - Решение Совета ЕЭК от 20.12.2017 № 107 (единые ставки пошлин для физлиц)
    - Постановления Правительства РФ № 1637 и № 1638 (ставки таможенного сбора, действуют с 01.01.2026)
    - Действующие коэффициенты утилизационного сбора и ставки акциза по мощности

    Формулы упрощены до уровня предварительной оценки и не заменяют официальный расчёт таможни.
*/


(function () {

    "use strict";


    /* ---------------------------------------------------
       Справочные таблицы ставок
    --------------------------------------------------- */

    // Курсы по умолчанию, если пользователь не поправил вручную
    const DEFAULT_RATES = {
        CNY: 12.6,
        KRW: 0.062,
        JPY: 0.62,
        EUR: 105,
        USD: 90,
        AED: 24.5,
        RUB: 1
    };

    // Страны, для которых есть отдельные страницы. slug совпадает с адресом страницы (/slug/)
    const COUNTRY_PAGES = [
        { value: "china",        slug: "china",        currency: "CNY" },
        { value: "yaponiya",     slug: "yaponiya",      currency: "JPY" },
        { value: "koreya",       slug: "koreya",        currency: "KRW" },
        { value: "gruziya",      slug: "gruziya",       currency: "USD" },
        { value: "kazakhstan",   slug: "kazakhstan",    currency: "USD" },
        { value: "kirgiziya",    slug: "kirgiziya",     currency: "USD" },
        { value: "germaniya",    slug: "germaniya",     currency: "EUR" },
        { value: "usa",          slug: "usa",           currency: "USD" },
        { value: "armeniya",     slug: "armeniya",      currency: "USD" },
        { value: "mongoliya",    slug: "mongoliya",     currency: "USD" },
        { value: "uzbekistan",   slug: "uzbekistan",    currency: "USD" },
        { value: "tadzhikistan", slug: "tadzhikistan",  currency: "USD" },
        { value: "oae",          slug: "oae",           currency: "AED" }
    ];

    // Пошлина для физлиц, авто младше 3 лет: [макс. стоимость €, % от стоимости, минимум €/см³]
    const DUTY_NEW_BY_VALUE = [
        { max: 8500,    percent: 0.54, minPerCc: 2.5 },
        { max: 16700,   percent: 0.48, minPerCc: 3.5 },
        { max: 42300,   percent: 0.48, minPerCc: 5.5 },
        { max: 84500,   percent: 0.48, minPerCc: 7.5 },
        { max: 169000,  percent: 0.48, minPerCc: 15.0 },
        { max: Infinity, percent: 0.48, minPerCc: 20.0 }
    ];

    // Пошлина по объёму двигателя, €/см³: [макс. объём см³, ставка 3-5 лет, ставка старше 5 лет]
    const DUTY_BY_ENGINE = [
        { max: 1000, rate35: 1.5, rate5plus: 3.0 },
        { max: 1500, rate35: 1.7, rate5plus: 3.2 },
        { max: 1800, rate35: 2.5, rate5plus: 3.5 },
        { max: 2300, rate35: 2.7, rate5plus: 4.8 },
        { max: 3000, rate35: 3.0, rate5plus: 5.0 },
        { max: Infinity, rate35: 3.6, rate5plus: 5.7 }
    ];

    // Таможенный сбор за оформление, ₽ (ставки с 01.01.2026)
    const CUSTOMS_FEE = [
        { max: 200000,    fee: 1231 },
        { max: 450000,    fee: 2462 },
        { max: 1200000,   fee: 4924 },
        { max: 2700000,   fee: 13541 },
        { max: 4200000,   fee: 18465 },
        { max: 5500000,   fee: 21344 },
        { max: 10000000,  fee: 49240 },
        { max: Infinity,  fee: 73860 }
    ];

    // Утильсбор, коммерческая шкала: [макс. л.с., коэфф. до 3 лет, коэфф. от 3 лет]
    const RECYCLE_COMMERCIAL = [
        { max: 90,  coefNew: 46.2,  coefOld: 66.44 },
        { max: 150, coefNew: 59.4,  coefOld: 85.28 },
        { max: 200, coefNew: 72.6,  coefOld: 104.12 },
        { max: 300, coefNew: 92.4,  coefOld: 132.38 },
        { max: Infinity, coefNew: 105.6, coefOld: 151.22 }
    ];

    const RECYCLE_BASE = 20000;

    // Акциз для юрлиц, ₽ за л.с. (ставки 2026)
    const EXCISE_TABLE = [
        { max: 90,  rate: 0 },
        { max: 150, rate: 64 },
        { max: 200, rate: 613 },
        { max: 300, rate: 1004 },
        { max: 400, rate: 1711 },
        { max: 500, rate: 1771 },
        { max: Infinity, rate: 1829 }
    ];

    const VAT_RATE = 0.22;


    /* ---------------------------------------------------
       Вспомогательные функции
    --------------------------------------------------- */

    function pickBracket(table, value, key) {
        for (const row of table) {
            if (value <= row.max) return row;
        }
        return table[table.length - 1];
    }

    function ageInMonths(year, month) {
        const now = new Date();
        const nowMonths = now.getFullYear() * 12 + (now.getMonth() + 1);
        const carMonths = year * 12 + month;
        return Math.max(0, nowMonths - carMonths);
    }

    function fmtRub(n) {
        return Math.round(n).toLocaleString("ru-RU") + " ₽";
    }

    function fmtEur(n) {
        return Math.round(n).toLocaleString("ru-RU") + " €";
    }


    /* ---------------------------------------------------
       Расчёт пошлины (ЕТС) для физлица
    --------------------------------------------------- */

    function calcDutyPerson(ageMonths, engineCc, valueEur, fuel) {

        if (fuel === "electric") {
            return {
                amountEur: valueEur * 0.15,
                explain: "Электромобиль: 15% от таможенной стоимости"
            };
        }

        if (ageMonths < 36) {
            const bracket = pickBracket(DUTY_NEW_BY_VALUE, valueEur, "max");
            const byPercent = valueEur * bracket.percent;
            const byMin = engineCc * bracket.minPerCc;
            const amount = Math.max(byPercent, byMin);
            const usedPercent = byPercent >= byMin;
            return {
                amountEur: amount,
                explain: usedPercent
                    ? `Авто младше 3 лет: ${Math.round(bracket.percent * 100)}% от стоимости (больше минимума в ${bracket.minPerCc} €/см³)`
                    : `Авто младше 3 лет: минимум ${bracket.minPerCc} €/см³ (больше, чем ${Math.round(bracket.percent * 100)}% от стоимости)`
            };
        }

        const bracket = pickBracket(DUTY_BY_ENGINE, engineCc, "max");

        if (ageMonths < 60) {
            return {
                amountEur: engineCc * bracket.rate35,
                explain: `Авто 3–5 лет: ${bracket.rate35} €/см³ × ${engineCc} см³ (цена на пошлину не влияет)`
            };
        }

        return {
            amountEur: engineCc * bracket.rate5plus,
            explain: `Авто старше 5 лет: ${bracket.rate5plus} €/см³ × ${engineCc} см³ (цена на пошлину не влияет)`
        };
    }


    /* ---------------------------------------------------
       Расчёт пошлины для юрлица (упрощённая модель)
    --------------------------------------------------- */

    function calcDutyCompany(ageMonths, engineCc, valueEur) {

        if (ageMonths < 36) {
            return {
                amountEur: valueEur * 0.15,
                explain: "Юрлицо, авто младше 3 лет: 15% от таможенной стоимости"
            };
        }

        if (ageMonths < 84) {
            const byPercent = valueEur * 0.20;
            const byMin = engineCc * 0.5; // ориентир в диапазоне 0,36–0,80 €/см³
            const amount = Math.max(byPercent, byMin);
            return {
                amountEur: amount,
                explain: "Юрлицо, авто 3–7 лет: 20% от стоимости либо минимум за см³ (точный минимум зависит от объёма, уточняйте у брокера)"
            };
        }

        return {
            amountEur: engineCc * 2.0, // ориентир в диапазоне 1,4–3,2 €/см³
            explain: "Юрлицо, авто старше 7 лет: фиксированная ставка за см³ (ориентировочно, диапазон 1,4–3,2 €/см³)"
        };
    }


    /* ---------------------------------------------------
       Утилизационный сбор
    --------------------------------------------------- */

    function calcRecycle(ageMonths, engineCc, powerHp, fuel, owner, personalUse) {

        const powerLimit = fuel === "electric" ? 80 : 160;
        const engineOk = fuel === "electric" ? true : engineCc <= 3000;

        const eligiblePreferential =
            owner === "person" &&
            personalUse &&
            powerHp <= powerLimit &&
            engineOk;

        if (eligiblePreferential) {
            const coef = ageMonths < 36 ? 0.17 : 0.26;
            return {
                amountRub: RECYCLE_BASE * coef,
                preferential: true,
                explain: `Льготная ставка: коэффициент ${coef} — автомобиль укладывается в лимиты по мощности и объёму`
            };
        }

        const bracket = pickBracket(RECYCLE_COMMERCIAL, powerHp, "max");
        const coef = ageMonths < 36 ? bracket.coefNew : bracket.coefOld;

        let reason = "коммерческая ставка";
        if (owner === "person" && !personalUse) reason = "ввоз не для личного пользования";
        else if (owner === "person" && powerHp > powerLimit) reason = `мощность выше ${powerLimit} л.с.`;
        else if (owner === "person" && !engineOk) reason = "объём двигателя больше 3000 см³";
        else if (owner === "company") reason = "юридическое лицо";

        return {
            amountRub: RECYCLE_BASE * coef,
            preferential: false,
            explain: `Коммерческая ставка (${reason}): коэффициент ${coef}`
        };
    }


    /* ---------------------------------------------------
       Основной расчёт
    --------------------------------------------------- */

    function runCalculation() {

        const owner = document.querySelector("#ownerSwitch .seg-btn.is-active").dataset.value;
        const personalUse = document.getElementById("personalUse").checked;

        const currency = document.getElementById("currency").value;
        const price = Number(document.getElementById("carPrice").value) || 0;
        const delivery = Number(document.getElementById("delivery").value) || 0;
        const rateToRub = Number(document.getElementById("rateToRub").value) || DEFAULT_RATES[currency];
        const eurToRub = Number(document.getElementById("eurToRub").value) || DEFAULT_RATES.EUR;

        const year = Number(document.getElementById("year").value);
        const month = Number(document.getElementById("month").value);
        const engine = Number(document.getElementById("engine").value) || 0;
        const power = Number(document.getElementById("power").value) || 0;
        const fuel = document.getElementById("fuel").value;

        const result = document.getElementById("result");

        if (!price || !year || (fuel !== "electric" && !engine)) {
            result.innerHTML = `<p class="receipt-placeholder">Заполните стоимость автомобиля, год выпуска` +
                (fuel !== "electric" ? " и объём двигателя." : ".") + `</p>`;
            return;
        }

        const ageMonths = ageInMonths(year, month);
        const ageYears = (ageMonths / 12).toFixed(1);

        const valueOriginal = price + delivery;
        const valueRub = valueOriginal * rateToRub;
        const valueEur = currency === "EUR" ? valueOriginal : valueRub / eurToRub;

        // Пошлина / ЕТС
        const duty = owner === "person"
            ? calcDutyPerson(ageMonths, engine, valueEur, fuel)
            : calcDutyCompany(ageMonths, engine, valueEur);
        const dutyRub = duty.amountEur * eurToRub;

        // Таможенный сбор
        const feeBracket = pickBracket(CUSTOMS_FEE, valueRub, "max");
        const feeRub = feeBracket.fee;

        // Утильсбор
        const recycle = calcRecycle(ageMonths, engine, power, fuel, owner, personalUse);

        // Акциз и НДС — только для юрлиц
        let exciseRub = 0;
        let vatRub = 0;
        if (owner === "company") {
            const exciseBracket = pickBracket(EXCISE_TABLE, power, "max");
            exciseRub = power * exciseBracket.rate;
            vatRub = (valueRub + dutyRub + exciseRub) * VAT_RATE;
        }

        const total = dutyRub + feeRub + recycle.amountRub + exciseRub + vatRub;

        // Дополнительные расходы, не входящие в таможенные платежи
        const sbktsRub = 20000;
        const eptsRub = 1200;
        const extrasTotal = sbktsRub + eptsRub;

        /* ---- рендер результата в виде декларации ---- */

        let html = "";

        html += `<div class="receipt-title">Расчёт растаможки</div>`;
        html += `<div class="receipt-sub">Возраст автомобиля: ${ageYears} лет · таможенная стоимость: ${fmtRub(valueRub)} (${fmtEur(valueEur)})</div>`;

        html += `<div class="receipt-line"><span>${owner === "person" ? "Единая таможенная ставка (пошлина)" : "Таможенная пошлина"}</span><span>${fmtRub(dutyRub)}</span></div>`;
        html += `<div class="receipt-note">${duty.explain}</div>`;

        if (owner === "company") {
            html += `<div class="receipt-line"><span>Акциз (по мощности двигателя)</span><span>${fmtRub(exciseRub)}</span></div>`;
            html += `<div class="receipt-line"><span>НДС 22% (стоимость + пошлина + акциз)</span><span>${fmtRub(vatRub)}</span></div>`;
        }

        html += `<div class="receipt-line"><span>Таможенный сбор за оформление</span><span>${fmtRub(feeRub)}</span></div>`;
        html += `<div class="receipt-note">По таможенной стоимости ${fmtRub(valueRub)}</div>`;

        html += `<div class="receipt-line"><span>Утилизационный сбор</span><span>${fmtRub(recycle.amountRub)}</span></div>`;
        html += `<div class="receipt-note">${recycle.explain}</div>`;

        if (!recycle.preferential && owner === "person") {
            html += `<div class="receipt-warning">Автомобиль не попадает под льготный утильсбор, поэтому сумма заметно выше, чем можно было бы ожидать. Проверьте мощность и объём двигателя перед покупкой.</div>`;
        }

        html += `<div class="receipt-total"><span>Итого таможенных платежей</span><span>${fmtRub(total)}</span></div>`;

        html += `<div class="receipt-extra">`;
        html += `<div class="receipt-extra-label">Отдельно от таможни</div>`;
        html += `<div class="receipt-line"><span>СБКТС (ориентировочно)</span><span>${fmtRub(sbktsRub)}</span></div>`;
        html += `<div class="receipt-line"><span>ЭПТС (ориентировочно)</span><span>${fmtRub(eptsRub)}</span></div>`;
        html += `<div class="receipt-total"><span>Полный бюджет на оформление</span><span>${fmtRub(total + extrasTotal)}</span></div>`;
        html += `</div>`;

        html += `<div class="receipt-disclaimer">Расчёт предварительный и не заменяет официальное таможенное оформление. Курсы валют указаны ориентировочно — уточняйте актуальные перед сделкой.</div>`;

        result.innerHTML = html;
    }


    /* ---------------------------------------------------
       Инициализация формы
    --------------------------------------------------- */

    document.addEventListener("DOMContentLoaded", function () {

        const menuToggle = document.getElementById("menuToggle");
        const siteNav = document.getElementById("siteNav");

        if (menuToggle && siteNav) {

            menuToggle.addEventListener("click", function () {
                const open = siteNav.classList.toggle("is-open");
                menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
            });

            siteNav.querySelectorAll("a").forEach(function (link) {
                link.addEventListener("click", function () {
                    siteNav.classList.remove("is-open");
                    menuToggle.setAttribute("aria-expanded", "false");
                });
            });

            document.addEventListener("click", function (event) {
                if (!siteNav.contains(event.target) && !menuToggle.contains(event.target)) {
                    siteNav.classList.remove("is-open");
                    menuToggle.setAttribute("aria-expanded", "false");
                }
            });
        }

        const ownerSwitch = document.getElementById("ownerSwitch");

        if (ownerSwitch) {

            const purposeRow = document.getElementById("purposeRow");
            const currencySelect = document.getElementById("currency");
            const rateInput = document.getElementById("rateToRub");
            const fuelSelect = document.getElementById("fuel");
            const engineField = document.getElementById("engineField");
            const sourceCountrySelect = document.getElementById("sourceCountry");
            const countryContext = document.body.getAttribute("data-country-page");

            function syncOwnerUI() {
                const value = ownerSwitch.querySelector(".seg-btn.is-active").dataset.value;
                purposeRow.style.display = value === "person" ? "block" : "none";
            }

            ownerSwitch.querySelectorAll(".seg-btn").forEach(function (btn) {
                btn.addEventListener("click", function () {
                    ownerSwitch.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("is-active"));
                    btn.classList.add("is-active");
                    syncOwnerUI();
                });
            });

            function syncRateDefault() {
                rateInput.value = DEFAULT_RATES[currencySelect.value];
            }

            currencySelect.addEventListener("change", syncRateDefault);

            function syncFuelUI() {
                engineField.style.display = fuelSelect.value === "electric" ? "none" : "block";
            }

            fuelSelect.addEventListener("change", syncFuelUI);

            // На странице конкретной страны (china, yaponiya и т.д.) форма подставляет
            // страну и валюту по умолчанию. При выборе другой страны в списке — переход
            // на соответствующую страницу. На главной этот блок не срабатывает.
            if (countryContext && sourceCountrySelect) {

                sourceCountrySelect.value = countryContext;

                const currentConfig = COUNTRY_PAGES.find(function (c) {
                    return c.value === countryContext;
                });

                if (currentConfig) {
                    currencySelect.value = currentConfig.currency;
                }

                sourceCountrySelect.addEventListener("change", function () {
                    const target = COUNTRY_PAGES.find(function (c) {
                        return c.value === sourceCountrySelect.value;
                    });
                    if (target && target.slug !== countryContext) {
                        window.location.href = "/" + target.slug + "/";
                    }
                });
            }

            syncOwnerUI();
            syncRateDefault();
            syncFuelUI();

            document.getElementById("calculate").addEventListener("click", runCalculation);

            document.getElementById("calcForm").addEventListener("reset", function () {
                window.setTimeout(function () {
                    if (countryContext && sourceCountrySelect) {
                        sourceCountrySelect.value = countryContext;
                    }
                    syncRateDefault();
                    document.getElementById("eurToRub").value = 105;
                    document.getElementById("result").innerHTML =
                        `<p class="receipt-placeholder">Здесь появится расчёт с разбивкой по каждому платежу — как только вы заполните стоимость автомобиля, год выпуска и объём двигателя.</p>`;
                }, 10);
            });

        }

    });

})();
