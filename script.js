/*
    Rastamozhka Calc
    Клиентский расчет предварительной стоимости оформления автомобиля

    Важно:
    Формулы являются примерной моделью.
    Итоговые платежи зависят от действующего законодательства.
*/


document.addEventListener("DOMContentLoaded", function () {


    const calculateButton =
        document.getElementById("calculate");


    const form =
        document.getElementById("calcForm");


    const result =
        document.getElementById("result");


    if (!calculateButton || !form || !result) {
        return;
    }



    calculateButton.addEventListener(
        "click",
        function () {


            const price =
                Number(
                    document.getElementById("price").value
                );


            const engine =
                Number(
                    document.getElementById("engine").value
                );


            const year =
                Number(
                    document.getElementById("year").value
                );


            const fuel =
                document.getElementById("fuel").value;



            if (!price || !engine || !year) {


                result.innerHTML = `

                <p>
                Заполните стоимость автомобиля, объем двигателя и год выпуска.
                </p>

                `;


                return;

            }



            const currentYear =
                new Date().getFullYear();


            const age =
                currentYear - year;



            /*
                Упрощенная модель расчета.
                Используется только для предварительной оценки.
            */


            let engineRate = 0;


            if (engine <= 1000) {

                engineRate = 1.5;

            } 
            else if (engine <= 1500) {

                engineRate = 2;

            } 
            else if (engine <= 2000) {

                engineRate = 3;

            } 
            else if (engine <= 3000) {

                engineRate = 4;

            } 
            else {

                engineRate = 5;

            }



            let ageCoefficient = 1;


            if (age >= 10) {

                ageCoefficient = 1.8;

            }
            else if (age >= 5) {

                ageCoefficient = 1.4;

            }
            else {

                ageCoefficient = 1;

            }



            let fuelCoefficient = 1;


            if (fuel === "Дизельный") {

                fuelCoefficient = 1.1;

            }


            if (fuel === "Гибрид") {

                fuelCoefficient = 0.8;

            }


            if (fuel === "Электромобиль") {

                fuelCoefficient = 0.5;

            }



            const estimated =
                Math.round(
                    price *
                    0.1 *
                    ageCoefficient *
                    fuelCoefficient +
                    engine * engineRate
                );



            const formatted =
                new Intl.NumberFormat(
                    "ru-RU"
                ).format(estimated);



            result.innerHTML = `

            <h3>
            Предварительная оценка
            </h3>

            <p>

            Возможный размер расходов:
            
            <strong>
            ${formatted}
            </strong>

            условных единиц

            </p>


            <p>

            Расчет является ориентировочным.
            Перед оформлением автомобиля необходимо
            проверить актуальные требования и ставки.

            </p>

            `;


        }

    );



    form.addEventListener(
        "reset",
        function () {

            setTimeout(
                function(){

                    result.innerHTML = `

                    <p>
                    После заполнения формы здесь появится
                    предварительный расчет.
                    </p>

                    `;

                },
                10
            );

        }
    );


});
