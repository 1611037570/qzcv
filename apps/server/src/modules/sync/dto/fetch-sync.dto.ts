import { IsString, Length, Matches } from 'class-validator'

export class FetchSyncDto {
  /** 6 位取件码，仅含大写字母与数字 */
  @IsString({ message: '取件码格式不正确' })
  @Length(6, 6, { message: '取件码必须是 6 位' })
  @Matches(/^[A-Z0-9]{6}$/, { message: '取件码只能包含大写字母与数字' })
  code: string
}
