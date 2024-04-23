import { APlugin, Controllers, type AEvent } from 'alemonjs'
import {
  DB,
  GameApi,
  isThereAUserPresent,
  sendReply,
  victoryCooling,
  activityCooling,
  activityCoolingNot,
  Server,
  getSkyComponent
} from '../../api/index.js'

export class SkyTower extends APlugin {
  constructor() {
    super({
      rule: [
        {
          reg: /^(#|\/)?进入通天塔$/,
          fnc: 'join'
        },
        {
          reg: /^(#|\/)?通天塔$/,
          fnc: 'showSky'
        },
        {
          reg: /^(#|\/)?挑战\d+$/,
          fnc: 'battle'
        }
      ]
    })
  }

  /**
   * 进入通天塔
   * @param e
   * @returns
   */
  async join(e: AEvent) {
    const UID = e.user_id
    if (!(await isThereAUserPresent(e, UID))) return

    if (!(await activityCooling(e, UID, '通天塔'))) return

    /**
     * 查看数据是否存在
     */
    const data: DB.SkyType = (await DB.sky.findOne({
      where: {
        uid: UID
      },
      raw: true
    })) as any

    if (data) {
      e.reply('已进入', {
        quote: e.msg_id
      })
      return
    }

    // 查看奖励
    if (await activityCoolingNot(UID, '通天塔奖励')) {
      const UserData: DB.UserType = (await DB.user.findOne({
        where: {
          uid: UID
        },
        raw: true
      })) as any

      const BagSize = await GameApi.Bag.backpackFull(UID, UserData.bag_grade)
      if (!BagSize) {
        e.reply(['储物袋空间不足'], {
          quote: e.msg_id
        })
        return
      }

      await GameApi.Bag.addBagThing(UID, UserData.bag_grade, [
        {
          name: '月中剑',
          acount: 1
        }
      ])
      e.reply(['进入[通天塔]\n获得[月中剑]*1'], {
        quote: e.msg_id
      })
    } else {
      e.reply(['进入[通天塔]'], {
        quote: e.msg_id
      })
      Controllers(e).Message.reply('', [
        { label: '挑战', value: '/挑战', enter: false }
      ])
    }

    await DB.sky.create({
      uid: UID
    } as DB.SkyType)

    return
  }

  /**
   * 通天塔
   * @param e
   * @returns
   */
  async showSky(e: AEvent) {
    const UID = e.user_id
    if (!(await isThereAUserPresent(e, UID))) return

    if (!(await activityCooling(e, UID, '通天塔'))) return

    /**
     * 查看数据是否存在
     */
    const data: DB.SkyType = (await DB.sky.findOne({
      where: {
        uid: UID
      },
      raw: true
    })) as any

    if (!data) {
      e.reply('未进入', {
        quote: e.msg_id
      })
      return
    }
    const img = await getSkyComponent(await Server.showSky(UID), UID)
    if (typeof img != 'boolean') {
      e.reply(img)
      Controllers(e).Message.reply('', [
        { label: '挑战', value: '/挑战', enter: false }
      ])
    }
    return
  }

  /**
   * 挑战
   * @param e
   * @returns
   */
  async battle(e: AEvent) {
    const UID = e.user_id
    if (!(await isThereAUserPresent(e, UID))) return
    if (!(await activityCooling(e, UID, '通天塔'))) return

    const CDID = 23,
      CDTime = GameApi.Cooling.CD_B
    if (!(await victoryCooling(e, UID, CDID))) return

    /**
     * 查看数据是否存在
     */
    const data: DB.SkyType = (await DB.sky.findOne({
      where: {
        uid: UID
      },
      raw: true
    })) as any

    if (!data) {
      e.reply('😃未进入', {
        quote: e.msg_id
      })
      return
    }

    const id = Number(e.msg.replace(/^(#|\/)?挑战/, ''))
    if (id <= data.id || id < 1) {
      e.reply('😅你干嘛', {
        quote: e.msg_id
      })
      return
    }

    // 设置redis
    GameApi.Burial.set(UID, CDID, CDTime)

    const UserDataB: DB.UserType = (await DB.user.findOne({
      where: {
        id: id
      }
    })) as any

    // 如果发现找不到。就说明位置是空的，占领位置。
    if (!UserDataB) {
      await DB.sky.update(
        {
          uid: data.uid
        },
        {
          where: {
            id: id
          }
        }
      )
      e.reply('位置占领成功')
      return
    }

    const UserData: DB.UserType = (await DB.user.findOne({
      where: {
        uid: UID
      }
    })) as any

    const BMSG = GameApi.Fight.start(UserData, UserDataB)

    // 是否显示战斗结果
    if (UserData.battle_show || UserDataB.battle_show) {
      // 切割战斗信息
      sendReply(e, '[战斗结果]', BMSG.msg)
    }

    if (BMSG.victory == '0') {
      /**
       * 反馈战斗信息
       */
      e.reply('🤪挑战失败,你与对方打成了平手', {
        quote: e.msg_id
      })
      return
    }

    if (BMSG.victory != UID) {
      /**
       * 反馈战斗信息
       */
      e.reply('🤪挑战失败,你被对方击败了', {
        quote: e.msg_id
      })
      return
    }

    await DB.sky.update(
      {
        uid: data.uid
      },
      {
        where: {
          id: id
        }
      }
    )

    await DB.sky.update(
      {
        uid: UserDataB.uid
      },
      {
        where: {
          id: data.id
        }
      }
    )

    e.reply(`😶挑战成功,当前排名${id}`, {
      quote: e.msg_id
    })
    return
  }
}
