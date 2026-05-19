import type { Event, Flash } from './index';

/**
 * 创建默认事件数据
 */
export function createDefaultEvents(): Event[] {
  return [
    {
      time: '20:30',
      star: '⭐⭐⭐⭐',
      text: '美国至5月9日当周初请失业金人数',
    },
    {
      time: '20:30',
      star: '⭐⭐⭐⭐',
      text: '美国4月零售销售月率',
    },
    {
      time: '22:00',
      star: '⭐⭐⭐',
      text: '美国3月商业库存月率',
    },
    {
      time: '22:15',
      star: '⭐⭐⭐⭐',
      text: '美联储官员发表讲话',
    },
  ];
}

/**
 * 创建默认快讯数据
 */
export function createDefaultFlashes(): Flash[] {
  return [
    {
      time: '20:52',
      hot: true,
      text: '现货黄金短线拉升，突破2390美元/盎司，日内涨幅扩大。',
    },
    {
      time: '20:48',
      hot: true,
      text: '美国零售销售数据公布后，美元指数回落，黄金买盘增强。',
    },
    {
      time: '20:41',
      hot: false,
      text: '美债收益率小幅震荡，市场等待美联储官员讲话。',
    },
    {
      time: '20:30',
      hot: true,
      text: '美国初请失业金人数与零售销售数据同步公布，贵金属波动放大。',
    },
    {
      time: '19:58',
      hot: false,
      text: '欧洲盘尾段，现货黄金维持高位整理。',
    },
  ];
}
