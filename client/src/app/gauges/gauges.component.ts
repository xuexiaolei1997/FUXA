import { Component, OnInit, OnDestroy, Injectable, Inject, Output, EventEmitter } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { Observable } from 'rxjs/Rx';

import { TranslateService } from '@ngx-translate/core';
import { HmiService } from '../_services/hmi.service';
import { ChartRangeType } from '../_models/chart';

import { GaugeBaseComponent } from './gauge-base/gauge-base.component';
import { SwitchComponent } from './switch/switch.component';
import { GaugeSettings, GaugeProperty, Variable, Event, GaugeEvent, GaugeEventType } from '../_models/hmi';
import { ValueComponent } from './controls/value/value.component';
import { GaugePropertyComponent, GaugeDialogType } from './gauge-property/gauge-property.component';
import { HtmlInputComponent } from './controls/html-input/html-input.component';
import { HtmlButtonComponent } from './controls/html-button/html-button.component';
import { HtmlSelectComponent } from './controls/html-select/html-select.component';
import { HtmlChartComponent } from './controls/html-chart/html-chart.component';
import { GaugeProgressComponent } from './controls/gauge-progress/gauge-progress.component';
import { GaugeSemaphoreComponent } from './controls/gauge-semaphore/gauge-semaphore.component';
import { ShapesComponent } from './shapes/shapes.component';
import { ProcEngComponent } from './shapes/proc-eng/proc-eng.component';

import { Dictionary } from '../_helpers/dictionary';
import { NgxDygraphsComponent } from '../gui-helpers/ngx-dygraphs/ngx-dygraphs.component';
import { forEach } from '@angular/router/src/utils/collection';


@Injectable()
export class GaugesManager {

    @Output() onchange: EventEmitter<Variable> = new EventEmitter();
    @Output() onevent: EventEmitter<Event> = new EventEmitter();

    // signalGaugeMap = new ViewSignalGaugeMap();      // map of all gauges (GaugeSettings) pro signals

    // map of gauges that have a click/html event
    eventGauge: MapGaugesSetting = {};
    // map of gauges with views
    mapGaugeView = {};
    // map of all signals and binded gauges of current view
    memorySigGauges = {};

    mapChart = {};
    // list of gauges tags to speed up the check
    gaugesTags = [];

    // list of gauges tags to check who as events
    gaugeWithEvents = [HtmlButtonComponent.TypeTag,
    GaugeSemaphoreComponent.TypeTag, ShapesComponent.TypeTag, ProcEngComponent.TypeTag];
    // list of gauges components
    static Gauges = [ValueComponent, HtmlInputComponent, HtmlButtonComponent,
        HtmlSelectComponent, HtmlChartComponent, GaugeProgressComponent, GaugeSemaphoreComponent, ShapesComponent, ProcEngComponent];

    constructor(private hmiService: HmiService,
        private translateService: TranslateService,
        private dialog: MatDialog) {
        // subscription to the change of variable value, then emit to the gauges of fuxa-view 
        this.hmiService.onVariableChanged.subscribe(sig => {
            try {
                this.onchange.emit(sig);
            } catch (err) {

            }
        });
        // subscription to DAQ values, then emit to charts gauges of fuxa-view 
        this.hmiService.onDaqResult.subscribe(message => {
            try {
                if (this.mapChart[message.gid]) {
                    let gauge: NgxDygraphsComponent = this.mapChart[message.gid];
                    for (let i = 0; i < message.values.length; i++) {
                        message.values[i][0] = new Date(message.values[i][0]);
                    }
                    gauge.setValues(message.values);
                }
            } catch (err) {

            }
        });
        // make the list of gauges tags to speed up the check
        GaugesManager.Gauges.forEach(g => {
            this.gaugesTags.push(g.TypeTag);
        });
    }

    ngOnDestroy() {
        console.log('GaugesManager destroy');
    }

    createSettings(id: string, type: string) {
        let gs: GaugeSettings = null;
        for (let i = 0; i < GaugesManager.Gauges.length; i++) {
            if (GaugesManager.Gauges[i].TypeTag === type) {
                gs = new GaugeSettings(id, type);
                gs.label = GaugesManager.Gauges[i].LabelTag;
                return gs;
            }
        }
        return gs;
    }

    isWithEvents(type) {
        if (type) {
            return this.gaugeWithEvents.indexOf(type) > -1;
        }
        return false;
    }

    isGauge(type: string) {
        return this.gaugesTags.indexOf(type) > -1;
    }

    /**
     * gauges to update in editor after changed property (GaugePropertyComponent, ChartPropertyComponent)
     * @param ga 
     */
    initInEditor(ga: GaugeSettings) {
        if (ga.type === GaugeProgressComponent.TypeTag) {
            GaugeProgressComponent.initElement(ga);
        } else if (ga.type === HtmlButtonComponent.TypeTag) {
            HtmlButtonComponent.initElement(ga);
        } else if (ga.type === HtmlChartComponent.TypeTag) {
            HtmlChartComponent.detectChange(ga);
        }
        return false;
    }

    //! toremove
    setSignalValue(sig: Variable) {
        this.onchange.emit(sig);
    }

    //! toremove
    initGaugesMap() {
        this.eventGauge = {};
        this.mapGaugeView = {};
    }

    /**
     * called from fuxa-view, is used to emit message for a refresh of all signals values and the gauges of view
     * @param domViewId 
     */
    emitBindedSignals(domViewId: string) {
        this.hmiService.emitMappedSignalsGauge(domViewId);
    }
	/**
	 * called from fuxa-view, bind dom view, gauge with signal (for animation) and event
	 * @param gaugekey
	 * @param gauge
	 * @param domViewId 
	 * @param ga 
	 * @param bindclick 
	 * @param bindhtmlevent 
	 */
    bindGauge(gauge: any, domViewId: string, ga: GaugeSettings, bindclick: any, bindhtmlevent: any) {
        let sigsid: string[] = this.getBindSignals(ga);
        if (sigsid) {
            for (let i = 0; i < sigsid.length; i++) {
                this.hmiService.addSignalGaugeToMap(domViewId, sigsid[i], ga);
                // check for special gauge to save in memory binded to sigid (chart-html)
                if (gauge) {
                    if (!this.memorySigGauges[sigsid[i]]) {
                        this.memorySigGauges[sigsid[i]] = {};
                        this.memorySigGauges[sigsid[i]][ga.id] = gauge;
                    } else if (!this.memorySigGauges[sigsid[i]][ga.id]) {
                        this.memorySigGauges[sigsid[i]][ga.id] = gauge;
                    }
                }
            }
        }
        let clicks: GaugeEvent[] = this.getBindClick(ga);
        if (clicks && clicks.length > 0) { // && !this.eventGauge[ga.id]) {
            this.eventGauge[ga.id] = ga;
            if (!this.mapGaugeView[ga.id]) {
                this.mapGaugeView[ga.id] = {};
                this.mapGaugeView[ga.id][domViewId] = ga;
                bindclick(ga);
            } else if (!this.mapGaugeView[ga.id][domViewId]) {
                this.mapGaugeView[ga.id][domViewId] = ga;
                bindclick(ga);
            }
            // add pointer
            let ele = document.getElementById(ga.id);
            if (ele) {
                ele.style.cursor = "pointer";
            }
            // bindclick(ga);
        }
        let htmlEvents = this.getHtmlEvents(ga);
        if (htmlEvents) {
            this.eventGauge[htmlEvents.dom.id] = ga;
            bindhtmlevent(htmlEvents);
        }
        this.checkElementToInit(ga);
    }


	/**
     * @param domViewId 
	 * called from fuxa-view, remove bind of dom view gauge
	 */
    unbindGauge(domViewId: string) {
        // first remove special gauge like chart from memorySigGauges
        let sigGaugeSettingsIdremoved = this.hmiService.removeSignalGaugeFromMap(domViewId);
        Object.keys(sigGaugeSettingsIdremoved).forEach(sid => {
            if (this.memorySigGauges[sid] && this.memorySigGauges[sid][sigGaugeSettingsIdremoved[sid]]) {
                delete this.memorySigGauges[sid][sigGaugeSettingsIdremoved[sid]];
            }
        });
        // remove mapped gauge for events of this view
        Object.values(this.mapGaugeView).forEach(val => {
            if (val[domViewId]) {
                delete val[domViewId];
            }
        });
    }

    /**
     * init element of fuxa-view,
     * @param ga 
     */
    checkElementToInit(ga: GaugeSettings) {
        if (ga.type === HtmlSelectComponent.TypeTag) {
            return HtmlSelectComponent.initElement(ga);
        }
        // } else if (ga.type === GaugeProgressComponent.TypeTag) {
        //   return GaugeProgressComponent.initElement(ga);
        // }
        return null;
    }

	/**
	 * get all gauge settings binded to dom view with the signal
	 * @param domViewId 
	 * @param sigid 
	 */
    getGaugeSettings(domViewId: string, sigid: string): GaugeSettings[] {
        let gslist = this.hmiService.getMappedSignalsGauges(domViewId, sigid);
        return gslist;
    }

	/**
	 * get all signals mapped in all dom views, used from LabComponent
	 * @param fulltext a copy with item name and source 
	 */
    getMappedGaugesSignals(fulltext: boolean) {
        return this.hmiService.getMappedVariables(fulltext);
    }

    /**
     * return all signals binded to the gauge
     * @param ga 
     */
    getBindSignals(ga: GaugeSettings) {
        if (ga.property) {
            for (let i = 0; i < GaugesManager.Gauges.length; i++) {
                if (GaugesManager.Gauges[i].TypeTag === ga.type) {
                    if (ga.type === HtmlChartComponent.TypeTag) {
                        let sigs = this.hmiService.getChartSignal(ga.property.id)
                        return sigs;
                    } else if (typeof GaugesManager.Gauges[i]['getSignals'] === 'function') {
                        return GaugesManager.Gauges[i]['getSignals'](ga.property);
                    } else {
                        return null;
                    }
                }
            }
        }
        return null;
    }

    /**
     * return all events binded to the gauge with click event
     * @param ga 
     */
    getBindClick(ga: GaugeSettings) {
        for (let i = 0; i < GaugesManager.Gauges.length; i++) {
            if (GaugesManager.Gauges[i].TypeTag === ga.type) {
                if (typeof GaugesManager.Gauges[i]['getEvents'] === 'function') {
                    return GaugesManager.Gauges[i]['getEvents'](ga.property, GaugeEventType.click);
                } else {
                    return null;
                }
            }
        }
        return null;
    }

    /**
     * return all events binded to the html gauge ('key-enter' of input, 'change' of select)
     * @param ga
     */
    getHtmlEvents(ga: GaugeSettings): Event {
        if (ga.type === HtmlInputComponent.TypeTag) {
            return HtmlInputComponent.getHtmlEvents(ga);
        } else if (ga.type === HtmlSelectComponent.TypeTag) {
            return HtmlSelectComponent.getHtmlEvents(ga);
        }
        return null;
    }

	/**
	 * manage to which gauge to forward the process function
	 * @param ga 
	 * @param svgele 
	 * @param sig 
	 */
    processValue(ga: GaugeSettings, svgele: any, sig: Variable) {
        for (let i = 0; i < GaugesManager.Gauges.length; i++) {
            if (GaugesManager.Gauges[i].TypeTag === ga.type) {
                if (ga.type === HtmlChartComponent.TypeTag) {
                    if (ga.property.type !== 'history' && this.memorySigGauges[sig.id]) {
                        Object.keys(this.memorySigGauges[sig.id]).forEach(k => {
                            if (k === ga.id) {
                                HtmlChartComponent.processValue(ga, svgele, sig, this.memorySigGauges[sig.id][k]);
                            }
                        });
                    }
                } else if (typeof GaugesManager.Gauges[i]['processValue'] === 'function') {
                    return GaugesManager.Gauges[i]['processValue'](ga, svgele, sig);
                } else {
                    return null;
                }
            }
        }
    }

    /**
     * called from fuxa-view to emit and send signal value from a gauge event ('key-enter' of input, 'change' of select)
     * @param event 
     */
    putEvent(event: Event) {
        if (event.ga.property && event.ga.property.variableId) {
            this.hmiService.putSignalValue(event.ga.property.variableId, event.value);
            event.dbg = 'put ' + event.ga.property.variableId + ' ' + event.value;
        }
        this.onevent.emit(event);
    }

    /**
     * called from fuxa-view to emit and send signal value from a gauge event (click)
     * @param sigid 
     * @param val 
     */
    putSignalValue(sigid: string, val: string) {
        this.hmiService.putSignalValue(sigid, val);
    }

    static getEditDialogTypeToUse(type: string): GaugeDialogType {
        for (let i = 0; i < GaugesManager.Gauges.length; i++) {
            if (GaugesManager.Gauges[i].TypeTag === type) {
                if (typeof GaugesManager.Gauges[i]['getDialogType'] === 'function') {
                    return GaugesManager.Gauges[i]['getDialogType']();
                } else {
                    return null;
                }
            }
        }
    }

    /**
     * used from controls in editor to get default value of edit gauge property
     */
    static getDefaultValue(type: string): any {
        if (type === GaugeProgressComponent.TypeTag) {
            return GaugeProgressComponent.getDefaultValue();
        }
        return null;
    }

    /**
     * used from controls in editor, to set the colorpicker of selected control
     */
    static checkGaugeColor(ele: any, eles: any, colors: any): boolean {
        if (ele && eles && (eles.length <= 1 || !eles[1])) {
            if (ele.type === GaugeProgressComponent.TypeTag) {
                colors.fill = GaugeProgressComponent.getFillColor(eles[0]);
                colors.stroke = GaugeProgressComponent.getStrokeColor(eles[0]);
                return true;
            } else if (ele.type === GaugeSemaphoreComponent.TypeTag) {
                colors.fill = GaugeSemaphoreComponent.getFillColor(eles[0]);
                colors.stroke = GaugeSemaphoreComponent.getStrokeColor(eles[0]);
                return true;
            } else if (ele.type === HtmlButtonComponent.TypeTag) {
                colors.fill = HtmlButtonComponent.getFillColor(eles[0]);
                colors.stroke = HtmlButtonComponent.getStrokeColor(eles[0]);
                return true;
            } else if (ele.type === HtmlInputComponent.TypeTag) {
                colors.fill = HtmlInputComponent.getFillColor(eles[0]);
                colors.stroke = HtmlInputComponent.getStrokeColor(eles[0]);
                return true;
            } else if (ele.type === HtmlSelectComponent.TypeTag) {
                colors.fill = HtmlSelectComponent.getFillColor(eles[0]);
                colors.stroke = HtmlSelectComponent.getStrokeColor(eles[0]);
                return true;
            }
        }
        return false;
    }

    /**
     * used from controls in editor to change fill and stroke colors
     * @param bkcolor 
     * @param color 
     * @param elems 
     */
    static initElementColor(bkcolor, color, elements) {
        var elems = elements.filter(function(el) { return el; });
        for (let i = 0; i < elems.length; i++) {
            let type = elems[i].getAttribute('type');
            if (type === GaugeProgressComponent.TypeTag) {
                GaugeProgressComponent.initElementColor(bkcolor, color, elems[i]);
            } else if (type === HtmlButtonComponent.TypeTag) {
                HtmlButtonComponent.initElementColor(bkcolor, color, elems[i]);
            } else if (type === HtmlInputComponent.TypeTag) {
                HtmlInputComponent.initElementColor(bkcolor, color, elems[i]);
            } else if (type === HtmlSelectComponent.TypeTag) {
                HtmlSelectComponent.initElementColor(bkcolor, color, elems[i]);
            }
        }
    }

	/**
	 * initialize the gauge element found in svg, 
	 * in svg is only a 'div' that have to be dynamic build and render from angular
	 * @param ga gauge settings
	 * @param res reference to factory
	 * @param ref reference to factory
	 * @param isview in view or editor, in editor have to disable mouse activity
	 */
    initElementAdded(ga: GaugeSettings, res: any, ref: any, isview: boolean) {
        // add variable
        let sigsid: string[] = this.getBindSignals(ga);
        if (sigsid) {
            for (let i = 0; i < sigsid.length; i++) {
                this.hmiService.addSignal(sigsid[i], ga);
            }
        }
        if (ga.type === HtmlChartComponent.TypeTag) {
            // prepare attribute
            let chartRange = ChartRangeType;
            Object.keys(chartRange).forEach(key => {
                this.translateService.get(chartRange[key]).subscribe((txt: string) => { chartRange[key] = txt });
            });
            let gauge: NgxDygraphsComponent = HtmlChartComponent.initElement(ga, res, ref, isview, chartRange);
            gauge.init();
            if (ga.property) {
                let chart = this.hmiService.getChart(ga.property.id)
                chart.lines.forEach(line => {
                    let sigid = HmiService.toVariableId(line.device, line.id);
                    let sigProperty = this.hmiService.getMappedVariable(sigid, true);
                    if (sigProperty) {
                        gauge.addLine(sigid, sigProperty.name, line.color);
                    }
                });
                gauge.setOptions({ title: chart.name });
            }
            this.mapChart[ga.id] = gauge;
            gauge.resize();
            gauge.onTimeRange.subscribe(data => {
                console.log(ga.id + ' ' + data);
                this.hmiService.queryDaqValues(data);
            });
            gauge.setRange(Object.keys(chartRange)[0]);
            // gauge.onTimeRange = this.onTimeRange;
            return gauge;
        }
    }

	/**
	 * clear memory object used from view, some reset
	 */
    clearMemory() {
        this.memorySigGauges = {};
    }
}

interface MapGaugesSetting {
    [x: string]: GaugeSettings
}