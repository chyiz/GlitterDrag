//TODO: 处理拖放区域为textArea,input@type=text
//

"use strict";

let isRunInOptionsContext = browser.runtime.getBackgroundPage !== undefined ? true : false;

const MIME_TYPE = {
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".bmp": "image/bmp",
    ".txt": "text/plain",
}


class Prompt {
    constructor() {
        this.container = document.createElement("div");
        this.container.id = "GDPrompt";
        this.textContainer = document.createElement("div");
        this.arrow = document.createElement("i")
        this.arrow.id = "GDArrow";
        this.container.appendChild(this.arrow);
        this.container.appendChild(this.textContainer);
        this.hide();
        document.body.appendChild(this.container);
    }
    renderDir(d = commons.DIR_U) {
        //DIR_UP_L
        //[DIR,UP,L]
        //[UP,L]
        //UP-L
        const suffix = d.split("_").slice(1).join("-");
        this.arrow.className = `GDArrow-${suffix}`;
    }

    renderText(t) {
        this.textContainer.textContent = t;
    }

    render(dir, text) {
        this.renderDir(dir);
        this.renderText(text);
    }
    stopRender() {
        this.hide();
    }
    display() {
        if (this.container.style.display === "none") this.container.style.display = "block";
    }
    hide() {
        this.container.style.display = "none";
    }
    remove() {
        document.body.removeChild(this.parent);
    }
}
class Indicator {
    constructor() {
        this.box = document.createElement("div");
        this.box.id = "GDIndicator";
        this.hide();
        document.body.appendChild(this.box);
    }
    place(x = 0, y = 0, radius = 0) {
        radius = radius / devicePixelRatio;
        this.box.style.left = (x - radius) + "px";
        this.box.style.top = (y - radius) + "px";
        const h = this.box.style.height = (radius * 2) + "px";
        const w = this.box.style.width = (radius * 2) + "px";
        this.box.style.borderRadius = `${w}  ${h}`;
    }
    display() {
        this.box.style.display = "initial";
    }
    hide() {
        this.box.style.display = "none";
    }
}
class DragClass {
    constructor(elem) {

        this.running = false;

        this.dragged = elem;
        this.handler = this.handler.bind(this);
        ["dragstart", "dragend", "dragover", "drop"].forEach(name =>
            //这里是capture阶段
            this.dragged.addEventListener(name, evt => this.handler(evt), true)
        );
        //添加在冒泡阶段
        //网页如果自己添加了dragstart事件并使用preventDefault，会阻止浏览器的拖拽功能
        //这里取消preventDefault的作用
        document.addEventListener("dragstart", (event) => {
            // console.log(event);
            event.returnValue = true;
        }, false);


        this.selection = "";
        this.targetElem = null;
        this.targetType = commons.TYPE_UNKNOWN;
        this.actionType = "textAction";
        this.direction = commons.DIR_U;
        this.distance = 0;
        this.startPos = {
            x: 0,
            y: 0
        };
        this.endPos = {
            x: 0,
            y: 0
        };
        this.promptBox = null;
        this.indicatorBox = null;
        this.isFirstRender = true;
    }

    post() {
        let sel = ""; //选中的数据,文本，链接
        let text = ""; //选中的文本，跟上面的可能相同可能不同
        switch (this.targetType) {
            case commons.TYPE_TEXT:
            case commons.TYPE_TEXT_URL:
                text = sel = this.selection;
                break;
            case commons.TYPE_TEXT_AREA:
                sel = this.targetElem.value;
                text = sel = sel.substring(this.targetElem.selectionStart, this.targetElem.selectionEnd);
                break;
            case commons.TYPE_ELEM_A:
                sel = this.targetElem.href;
                text = this.targetElem.textContent;
                break;
            case commons.TYPE_ELEM_IMG:
                sel = this.targetElem.src;
                break;
            case commons.TYPE_ELEM:
                sel = "";
                break;
            default:
                break;
        }
        this.selection = sel;
        //sendMessage只能传递字符串化后（类似json）的数据
        //不能传递具体对象
        let sended = {
            direction: this.direction,
            selection: sel,
            textSelection: text,
            actionType: this.actionType,
            sendToOptions: false
        }

        if (isRunInOptionsContext) {
            sended.sendToOptions = true;
            backgroundPage.executor.DO(sended);
        }
        else browser.runtime.sendMessage(sended);
    }
    dragstart(evt) {
        if (bgConfig.enableIndicator) {
            if (this.indicatorBox === null) this.indicatorBox = new Indicator();
            this.indicatorBox.place(evt.pageX, evt.pageY, bgConfig.triggeredDistance);
            this.indicatorBox.display();
        }
        if (bgConfig.enablePrompt) {
            if (this.promptBox === null) this.promptBox = new Prompt();
        }
        this.targetElem = evt.target;
        this.selection = document.getSelection().toString().trim();
        this.targetType = checkDragTargetType(this.selection, this.targetElem);
        this.actionType = getActionType(this.targetType);
        this.startPos.x = evt.screenX;
        this.startPos.y = evt.screenY;
    }
    dragend(evt) {
        if (this.promptBox) { // may be null if viewing an image
            this.promptBox.stopRender();
        }
        this.indicatorBox && this.indicatorBox.hide();
        // this.selection = String.prototype.trim(this.selection);
        if (this.distance >= bgConfig.triggeredDistance) {
            this.post();
        }

    }
    dragover(evt) {
        this.distance = Math.hypot(this.startPos.x - evt.screenX, this.startPos.y - evt.screenY);
        if (this.distance > bgConfig.triggeredDistance) {
            this.direction = this.getDirection();
            if (this.promptBox !== null) {
                this.promptBox.display();
                let message = ""
                if (this.direction in bgConfig.Actions[this.actionType]) {
                    message = geti18nMessage(bgConfig.Actions[this.actionType][this.direction]["act_name"]);
                }
                this.promptBox.render(this.direction, message);
            }
        }
        else {
            if (this.promptBox) { // may be null if viewing an image
                this.promptBox.stopRender();
            }
        }
    }
    handler(evt) {
        //dragstart target是拖拽的东西
        //dragend   同上
        //dragover  target是document
        //drop      同上

        //document 无getAttribute
        //

        const type = evt.type;
        this.endPos.x = evt.screenX;
        this.endPos.y = evt.screenY;
        //TODO:把拖拽的数据放在event里传递
        if (type === "dragstart") {
            // 如果target没有设置draggable属性，那么才处理
            if (evt.target.nodeName === "#text" || (evt.target.getAttribute && evt.target.getAttribute("draggable") === null)) {
                this.running = true;
                evt.dataTransfer.effectAllowed = "move";
                this.dragstart(evt);
            }
        }
        else if (type === "dragend") {
            if (this.running) {
                this.running = false;
                this.dragend(evt);
            }
        }
        else if (type === "drop") {
            //如果是从浏览器外部外浏览器拽文件或其它东西，并且放下东西，那么这个事件会被触发，加一个判断
            //判断脚本有没有处在运行阶段，否则不处理
            //这样就不会和页面本身的拖拽功能重突
            if (this.running) {
                // this.running = false;
                evt.preventDefault();
            }
        }
        else if (type === "dragover") {
            //如果是从浏览器外部外浏览器拽文件或其它东西，经过页面，那么这个事件会被触发，加一个判断
            //判断脚本有没有处在运行阶段，否则不处理
            if (this.running) {
                this.dragover(evt);
                // evt.dataTransfer.dropEffect = "move";
                evt.preventDefault();
            }
        }
    }

    getDirection() {
        function BETW(a, b) {
            if (a < 0 || b < 0 || a > 360 || b > 360) alert("范围错误");
            return a < b && a <= scale && scale < b;
        }

        let d = {
            normal: commons.DIR_D, //普通的四个方向
            horizontal: commons.DIR_L, //水平方向,只有左右
            vertical: commons.DIR_D, //竖直方向，只有上下
            all: commons.DIR_D //达到了8个方向，绝对够用
        }

        let rad = Math.atan2(this.startPos.y - this.endPos.y, this.endPos.x - this.startPos.x);
        let degree = rad * (180 / Math.PI);
        let unit = 0; //按方向分割后的每一部分角度单元
        let scale = 0; //把得到的角度除以单元得到相应的比例,

        degree = degree >= 0 ? degree : degree + 360; //-180~180转换成0~360

        unit = 360 / 8; //4个方向需要分割成八部分，也就是方向*2
        scale = degree / unit;
        if (BETW(1, 3)) d.normal = commons.DIR_U; //unit*1=45, unit*3=135
        else if (BETW(3, 5)) d.normal = commons.DIR_L;
        else if (BETW(5, 7)) d.normal = commons.DIR_D;
        //角度越过零，放在这里
        else d.normal = commons.DIR_R;

        unit = 360 / 4;
        scale = degree / unit;
        if (BETW(1, 3)) d.horizontal = commons.DIR_L;
        else d.horizontal = commons.DIR_R;

        unit = 360 / 4;
        scale = degree / unit;
        if (BETW(0, 2)) d.vertical = commons.DIR_U;
        else d.vertical = commons.DIR_D;

        unit = 360 / 16;
        scale = degree / unit;
        if (BETW(1, 3)) d.all = commons.DIR_UP_R;
        else if (BETW(3, 5)) d.all = commons.DIR_U;
        else if (BETW(5, 7)) d.all = commons.DIR_UP_L;
        else if (BETW(7, 9)) d.all = commons.DIR_L;
        else if (BETW(9, 11)) d.all = commons.DIR_LOW_L;
        else if (BETW(11, 13)) d.all = commons.DIR_D;
        else if (BETW(13, 15)) d.all = commons.DIR_LOW_R;
        else d.all = commons.DIR_R;
        // return d.normal;
        switch (bgConfig.directionControl[this.actionType]) {
            case commons.ALLOW_ALL:
                return d.all;
            case commons.ALLOW_NORMAL:
                return d.normal;
            case commons.ALLOW_H:
                return d.horizontal;
            case commons.ALLOW_V:
                return d.vertical;
            case commons.ALLOW_ONE:
                return d.normal;
            default:
                return d.normal;
        }
    }

}


function CSlistener(msg) {
    let needExecute = true;
    let elem = mydrag.targetElem;
    let input = document.createElement("textarea");
    input.style.width = "0px";
    input.style.height = "0px";

    if (elem instanceof HTMLAnchorElement) {
        switch (msg.copy_type) {
            case commons.COPY_LINK:
                input.value = elem.href;
                break;
            case commons.COPY_TEXT:
                input.value = elem.textContent;
                break;
            case commons.COPY_IMAGE:
                if ((mydrag.targetElem = elem.querySelector("img")) != null) {
                    CSlistener(msg); //可能有更好的办法
                }
        }
        return;

    }
    else if (elem instanceof HTMLImageElement) {
        if (msg.command === "copy") {
            switch (msg.copy_type) {
                case commons.COPY_LINK:
                    input.value = elem.src;
                    break;
                case commons.COPY_IMAGE:
                    needExecute = false;
                    browser.runtime.sendMessage({ imageSrc: elem.src });
                    // getImageBase64(elem.src, (s) => {
                    //     browser.runtime.sendMessage({ imageBase64: s });
                    // })
                    break;
            }
        }

    }
    else {
        input.value = mydrag.selection;
    }
    if (needExecute) {
        elem.parentElement.appendChild(input);
        input.focus();
        input.setSelectionRange(0, input.value.length);
        document.execCommand("copy");
        elem.parentElement.removeChild(input);
    }
}

browser.runtime.onConnect.addListener(port => {
    if (port.name === "sendToContentScript") {
        port.onMessage.addListener(CSlistener);
    }
});
let bgPort = browser.runtime.connect({ name: "getConfig" });
let bgConfig = null;
let mydrag = null;
bgPort.onMessage.addListener((c) => {
    bgConfig = JSON.parse(c);
    if (["loading", "interactive"].includes(document.readyState)) {
        document.addEventListener("DOMContentLoaded", () => {
            if (mydrag === null) {
                mydrag = new DragClass(document);
            }

        }, { once: true });
    }
    else {
        mydrag = new DragClass(document);
    }

});