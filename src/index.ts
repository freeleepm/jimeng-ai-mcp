import axios from 'axios';
import crypto from 'crypto';

/**
 * 即梦AI客户端配置
 */
export interface JimengClientConfig {
  accessKey?: string;
  secretKey?: string;
  endpoint?: string;
  host?: string;
  region?: string;
  service?: string;
  debug?: boolean;
  timeout?: number;
  retries?: number;
}

/**
 * 图像生成参数
 */
export interface GenerateImageParams {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  return_url?: boolean;
  req_key?: string;
  region?: string;
}

/**
 * 图像生成响应
 */
export interface GenerateImageResponse {
  success: boolean;
  image_urls?: string[];
  error?: string;
  raw_response?: any;
}

/**
 * 视频生成参数 - 文生视频
 */
export interface GenerateVideoParams {
  prompt: string;  // 视频内容描述，必需参数
  req_key?: string;  // 模型标识符，可选，默认为"jimeng_vgfm_t2v_l20"
  region?: string;  // 区域，可选，默认为"cn-north-1"
}

/**
 * 视频生成任务提交响应
 */
export interface VideoTaskSubmitResponse {
  success: boolean;
  task_id?: string;
  error?: string;
  raw_response?: any;
}

/**
 * 视频生成结果查询响应
 */
export interface VideoTaskResultResponse {
  success: boolean;
  status?: string; // 任务状态：PENDING, RUNNING, SUCCEEDED, FAILED
  video_urls?: string[];
  error?: string;
  raw_response?: any;
}

/**
 * 视频生成响应
 */
export interface GenerateVideoResponse {
  success: boolean;
  video_urls?: string[];
  error?: string;
  raw_response?: any;
  task_id?: string;
}

/**
 * 图生视频参数
 */
export interface GenerateI2VParams {
  /**
   * 模型标识符，默认为"jimeng_vgfm_i2v_l20"
   */
  req_key?: string;
  
  /**
   * 图片URL，必填
   */
  image_url?: string;
  
  /**
   * 图片URL数组，优先级高于image_url
   */
  image_urls?: string[];
  
  /**
   * 提示词，可选
   */
  prompt?: string;
  
  /**
   * 指定输出视频的长宽比，可选值："1:1", "4:3", "2:1", "3:2", "16:9"，默认 "16:9"
   */
  aspect_ratio?: string;

  /**
   * 区域，可选，默认为"cn-north-1"
   */
  region?: string;
}

/**
 * 即梦AI客户端
 * 使用火山引擎V4签名算法实现
 */
export class JimengClient {
  private accessKey: string;
  private secretKey: string;
  private endpoint: string;
  private host: string;
  private region: string;
  private service: string;
  private debug: boolean;
  private timeout: number;
  private retries: number;

  /**
   * 创建即梦AI客户端实例
   */
  constructor(config: JimengClientConfig = {}) {
    this.accessKey = config.accessKey || process.env.JIMENG_ACCESS_KEY || '';
    this.secretKey = config.secretKey || process.env.JIMENG_SECRET_KEY || '';
    this.endpoint = config.endpoint || 'https://visual.volcengineapi.com';
    this.host = config.host || 'visual.volcengineapi.com';
    this.region = config.region || 'cn-north-1';
    this.service = config.service || 'cv';
    this.debug = config.debug || false;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;

    // 验证必要的配置
    if (!this.accessKey || !this.secretKey) {
      throw new Error('缺少必要的配置: accessKey 和 secretKey');
    }

    if (this.debug) {
      console.log('JimengClient 初始化完成:');
      console.log('- 端点:', this.endpoint);
      console.log('- 区域:', this.region);
      console.log('- 服务:', this.service);
      console.log('- AccessKey:', this.accessKey);
      console.log('- SecretKey:', this.secretKey.substring(0, 3) + '...(已隐藏)');
    }
  }

  /**
   * 辅助函数：生成签名密钥
   */
  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac('sha256', key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('request').digest();
    return kSigning;
  }

  /**
   * 格式化查询参数
   */
  private formatQuery(parameters: Record<string, string>): string {
    const sortedKeys = Object.keys(parameters).sort();
    return sortedKeys.map(key => `${key}=${parameters[key]}`).join('&');
  }

  /**
   * 火山引擎V4签名算法
   */
  private signV4Request(
    reqQuery: string,
    reqBody: string,
    region?: string,
  ): { headers: Record<string, string>; requestUrl: string } {
    const t = new Date();
    const currentDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const datestamp = currentDate.substring(0, 8);
    const usedRegion = region || this.region;
    
    const method = 'POST';
    const canonicalUri = '/';
    const canonicalQuerystring = reqQuery;
    const signedHeaders = 'content-type;host;x-content-sha256;x-date';
    const payloadHash = crypto.createHash('sha256').update(reqBody).digest('hex');
    const contentType = 'application/json';
    
    const canonicalHeaders = [
      `content-type:${contentType}`,
      `host:${this.host}`,
      `x-content-sha256:${payloadHash}`,
      `x-date:${currentDate}`
    ].join('\n') + '\n';
    
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    if (this.debug) {
      console.log('规范请求字符串:\n' + canonicalRequest);
    }
    
    const algorithm = 'HMAC-SHA256';
    const credentialScope = `${datestamp}/${usedRegion}/${this.service}/request`;
    const stringToSign = [
      algorithm,
      currentDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');
    
    if (this.debug) {
      console.log('待签名字符串:\n' + stringToSign);
    }
    
    const signingKey = this.getSignatureKey(this.secretKey, datestamp, usedRegion, this.service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    
    if (this.debug) {
      console.log('签名值:', signature);
    }
    
    const authorizationHeader = `${algorithm} Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers = {
      'X-Date': currentDate,
      'Authorization': authorizationHeader,
      'X-Content-Sha256': payloadHash,
      'Content-Type': contentType,
      'Host': this.host
    };
    
    const requestUrl = `${this.endpoint}?${canonicalQuerystring}`;
    
    return { headers, requestUrl };
  }

  /**
   * 生成图像
   */
  public async generateImage(params: GenerateImageParams): Promise<GenerateImageResponse> {
    let lastError: Error | null = null;
    let retryCount = 0;
    
    while (retryCount <= this.retries) {
      try {
        // 验证必要的参数
        if (!params.prompt) {
          throw new Error('缺少必要的参数: prompt');
        }
        
        // 查询参数
        const queryParams = {
          'Action': 'CVProcess',
          'Version': '2022-08-31'
        };
        const formattedQuery = this.formatQuery(queryParams);
        
        // 请求体参数
        const bodyParams = {
          req_key: params.req_key || "jimeng_high_aes_general_v21_L",
          prompt: params.prompt,
          return_url: params.return_url !== undefined ? params.return_url : true,
          width: params.width || 512,
          height: params.height || 512,
          negative_prompt: params.negative_prompt
        };
        
        // 移除undefined值
        Object.keys(bodyParams).forEach(key => {
          if (bodyParams[key as keyof typeof bodyParams] === undefined) {
            delete bodyParams[key as keyof typeof bodyParams];
          }
        });
        
        const formattedBody = JSON.stringify(bodyParams);
        
        if (this.debug) {
          console.log('请求体:', formattedBody);
        }
        
        // 生成签名和请求头
        const { headers, requestUrl } = this.signV4Request(
          formattedQuery,
          formattedBody,
          params.region
        );
        
        if (this.debug) {
          console.log('请求URL:', requestUrl);
          console.log('请求头:', JSON.stringify(headers, null, 2));
        }
        
        // 发送请求
        const response = await axios.post(requestUrl, bodyParams, {
          headers: headers,
          timeout: this.timeout,
          validateStatus: null // 允许任何状态码
        });
        
        if (this.debug) {
          console.log('响应状态码:', response.status);
          console.log('响应头:', JSON.stringify(response.headers, null, 2));
          console.log('响应数据:', JSON.stringify(response.data, null, 2));
        }
        
        // 处理响应
        if (response.status !== 200) {
          throw new Error(`HTTP错误! 状态码: ${response.status}`);
        }
        
        // 检查API错误
        if (response.data.ResponseMetadata && response.data.ResponseMetadata.Error) {
          const error = response.data.ResponseMetadata.Error;
          throw new Error(`API错误: ${error.Message || '未知错误'}`);
        }
        
        // 返回结果
        if (response.data.data && response.data.data.image_urls && response.data.data.image_urls.length > 0) {
          return {
            success: true,
            image_urls: response.data.data.image_urls,
            raw_response: response.data
          };
        } else {
          return {
            success: false,
            error: '未生成图像或响应格式不正确',
            raw_response: response.data
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (this.debug) {
          console.error(`尝试 #${retryCount + 1} 失败:`, lastError.message);
        }
        
        retryCount++;
        
        // 如果已经达到最大重试次数，返回错误
        if (retryCount > this.retries) {
          if (this.debug) {
            console.error(`已达到最大重试次数 (${this.retries})，放弃重试`);
          }
          
          return {
            success: false,
            error: lastError.message
          };
        }
        
        // 指数退避策略
        const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        
        if (this.debug) {
          console.log(`等待 ${waitTime}ms 后重试...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // 不应该运行到这里
    return {
      success: false,
      error: '未知错误'
    };
  }

  /**
   * 生成视频 - 文生视频 (异步方式: 提交任务)
   */
  public async submitVideoTask(params: GenerateVideoParams): Promise<VideoTaskSubmitResponse> {
    let lastError: Error | null = null;
    const retries = 1;  // 只重试一次
    let retryCount = 0;
    
    while (retryCount <= retries) {
      try {
        // 验证必要的参数
        if (!params.prompt) {
          throw new Error('缺少必要的参数: prompt');
        }
        
        // 查询参数 - 使用异步提交任务API
        const queryParams = {
          'Action': 'CVSync2AsyncSubmitTask',
          'Version': '2022-08-31'
        };
        const formattedQuery = this.formatQuery(queryParams);
        
        // 请求体参数
        const bodyParams = {
          req_key: params.req_key || "jimeng_vgfm_t2v_l20",
          prompt: params.prompt
        };
        
        const formattedBody = JSON.stringify(bodyParams);
        
        // 总是开启调试信息以便排查问题
        console.log('提交任务请求体:', formattedBody);
        
        // 生成签名和请求头
        const { headers, requestUrl } = this.signV4Request(
          formattedQuery,
          formattedBody,
          params.region
        );
        
        // 打印请求信息以便调试
        console.log('提交任务请求URL:', requestUrl);
        console.log('提交任务请求头:', JSON.stringify(headers, null, 2));
        
        // 发送请求
        const response = await axios.post(requestUrl, bodyParams, {
          headers: headers,
          timeout: this.timeout,
          validateStatus: null // 允许任何状态码
        });
        
        // 打印响应信息以便调试
        console.log('提交任务响应状态码:', response.status);
        console.log('提交任务响应数据:', JSON.stringify(response.data, null, 2));
        
        // 处理响应
        if (response.status !== 200) {
          // 特殊处理429错误
          if (response.status === 429) {
            throw new Error(`API并发限制错误: 请求过于频繁，请稍后再试。详细信息: ${JSON.stringify(response.data)}`);
          }
          throw new Error(`HTTP错误! 状态码: ${response.status}，详细信息: ${JSON.stringify(response.data)}`);
        }
        
        // 检查API错误
        if (response.data.ResponseMetadata && response.data.ResponseMetadata.Error) {
          const error = response.data.ResponseMetadata.Error;
          throw new Error(`API错误: ${error.Message || '未知错误'}, 错误码: ${error.Code || '无代码'}`);
        }
        
        // 返回结果 - 任务ID
        if (response.data.data && response.data.data.task_id) {
          return {
            success: true,
            task_id: response.data.data.task_id,
            raw_response: response.data
          };
        } else {
          return {
            success: false,
            error: '提交任务失败或响应格式不正确',
            raw_response: response.data
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (this.debug) {
          console.error(`尝试提交任务 #${retryCount + 1} 失败:`, lastError.message);
        }
        
        retryCount++;
        
        // 如果已经达到最大重试次数，返回错误
        if (retryCount > retries) {
          if (this.debug) {
            console.error(`已达到最大重试次数 (${retries})，放弃重试`);
          }
          
          // 如果是429错误，给出更友好的提示
          if (lastError.message.includes('429') || lastError.message.includes('并发限制')) {
            return {
              success: false,
              error: '请求频率受限，请等待几分钟后再尝试提交视频生成任务。火山引擎对视频生成API有严格的并发限制。'
            };
          }
          
          return {
            success: false,
            error: lastError.message
          };
        }
        
        // 视频API调用等待时间设为固定的60秒（1分钟），符合QPS=1的限制
        const waitTime = 60000; // 60秒 = 1分钟
        
        console.log(`请求受限，等待 ${waitTime/1000} 秒后重试...`);
        console.log(`将在 ${new Date(Date.now() + waitTime).toLocaleTimeString()} 重试`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // 不应该运行到这里
    return {
      success: false,
      error: '未知错误'
    };
  }

  /**
   * 查询视频生成任务结果
   */
  public async getVideoTaskResult(taskId: string, reqKey: string = "jimeng_vgfm_t2v_l20"): Promise<VideoTaskResultResponse> {
    let lastError: Error | null = null;
    const retries = 1;  // 只重试一次
    let retryCount = 0;
    
    while (retryCount <= retries) {
      try {
        // 查询参数 - 使用查询结果API
        const queryParams = {
          'Action': 'CVSync2AsyncGetResult',
          'Version': '2022-08-31'
        };
        const formattedQuery = this.formatQuery(queryParams);
        
        // 请求体参数
        const bodyParams = {
          req_key: reqKey,
          task_id: taskId
        };
        
        const formattedBody = JSON.stringify(bodyParams);
        
        // 总是开启调试信息以便排查问题
        console.log('查询结果请求体:', formattedBody);
        
        // 生成签名和请求头
        const { headers, requestUrl } = this.signV4Request(
          formattedQuery,
          formattedBody,
          reqKey.split('_')[2] // 提取region
        );
        
        // 开启调试信息
        console.log('查询结果请求URL:', requestUrl);
        console.log('查询结果请求头:', headers);
        
        // 发送请求
        const response = await axios({
          url: requestUrl,
          method: 'POST',
          headers: headers,
          data: formattedBody,
        });
        
        console.log('查询结果响应状态码:', response.status);
        console.log('查询结果响应数据:', JSON.stringify(response.data, null, 2));
        
        // 处理响应
        if (response.status === 200) {
          const data = response.data;
          
          // 处理服务器内部错误和其他业务错误
          if (data.code !== 10000) {
            // 处理特定错误代码
            if (data.code === 50411) {
              // 内容安全检查未通过
              return {
                success: false,
                status: 'FAILED',
                error: `内容安全检查未通过: ${data.message}`,
                raw_response: data
              };
            }
            
            // 其他业务错误
            throw new Error(`服务器返回业务错误: ${data.message} (错误码: ${data.code})`);
          }
          
          // 处理状态
          const taskData = data.data;
          const taskStatus = taskData.status;
          
          let normalizedStatus = '';
          
          // 标准化状态值
          switch(taskStatus) {
            case 'in_queue':
              normalizedStatus = 'PENDING';
              break;
            case 'processing':
              normalizedStatus = 'RUNNING';
              break;
            case 'done':
              normalizedStatus = 'SUCCEEDED';
              break;
            case 'fail':
              normalizedStatus = 'FAILED';
              break;
            default:
              normalizedStatus = taskStatus.toUpperCase();
          }
          
          // 解析视频URL - 从两个可能的位置获取
          let videoUrls: string[] = [];
          
          // 1. 从resp_data中解析视频URLs（需要先将字符串解析为JSON对象）
          if (taskData.resp_data && typeof taskData.resp_data === 'string') {
            try {
              const respData = JSON.parse(taskData.resp_data);
              if (respData.urls && Array.isArray(respData.urls)) {
                videoUrls = respData.urls;
              }
            } catch (e) {
              console.error('解析resp_data时出错:', e);
            }
          }
          
          // 2. 如果存在video_url字段，添加到videoUrls
          if (taskData.video_url && typeof taskData.video_url === 'string') {
            videoUrls.push(taskData.video_url);
          }
          
          // 返回任务状态和视频URL
          return {
            success: true,
            status: normalizedStatus,
            video_urls: videoUrls,
            raw_response: data
          };
        } else {
          throw new Error(`HTTP错误! 状态码: ${response.status}，详细信息: ${JSON.stringify(response.data)}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (this.debug) {
          console.error(`尝试查询结果 #${retryCount + 1} 失败:`, lastError.message);
        }
        
        retryCount++;
        
        // 如果已经达到最大重试次数，返回错误
        if (retryCount > retries) {
          if (this.debug) {
            console.error(`已达到最大重试次数 (${retries})，放弃重试`);
          }
          
          return {
            success: false,
            error: lastError.message
          };
        }
        
        // 查询结果API调用使用较短的重试时间
        const waitTime = 5000; // 5秒
        
        console.log(`查询失败，等待 ${waitTime/1000} 秒后重试...`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // 不应该运行到这里
    return {
      success: false,
      error: '未知错误'
    };
  }

  /**
   * 生成视频 - 文生视频 (保留原方法作为兼容)
   * @deprecated 使用异步方式生成视频，请使用 submitVideoTask 和 getVideoTaskResult 代替
   */
  public async generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResponse> {
    console.log('警告: generateVideo 方法已过时，请使用 submitVideoTask 和 getVideoTaskResult 代替');
    
    // 提交任务
    const taskResult = await this.submitVideoTask(params);
    if (!taskResult.success || !taskResult.task_id) {
      return {
        success: false,
        error: taskResult.error || '提交任务失败'
      };
    }
    
    console.log(`任务提交成功，任务ID: ${taskResult.task_id}`);
    console.log('开始轮询任务结果...');
    
    // 轮询查询任务结果
    const maxAttempts = 30; // 最多等待30次
    const pollingInterval = 5000; // 5秒轮询一次
    
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`轮询任务结果 (${i+1}/${maxAttempts})...`);
      
      // 查询任务结果
      const result = await this.getVideoTaskResult(taskResult.task_id, params.req_key);
      
      if (result.success) {
        // 根据任务状态处理
        if ((result.status === 'SUCCEEDED' || result.status === 'done') && result.video_urls && result.video_urls.length > 0) {
          console.log('视频生成成功!');
          return {
            success: true,
            video_urls: result.video_urls,
            raw_response: result.raw_response,
            task_id: taskResult.task_id
          };
        } else if (result.status === 'FAILED') {
          return {
            success: false,
            error: '视频生成任务失败',
            raw_response: result.raw_response,
            task_id: taskResult.task_id
          };
        } else if (result.status === 'PENDING' || result.status === 'RUNNING') {
          console.log(`任务仍在进行中，状态: ${result.status}，等待 ${pollingInterval/1000} 秒后重试...`);
          // 任务仍在进行中，继续等待
          await new Promise(resolve => setTimeout(resolve, pollingInterval));
          continue;
        }
      }
      
      // 查询失败或状态异常，等待后重试
      console.log('查询任务结果失败或状态异常，等待后重试...');
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
    
    // 超过最大尝试次数
    return {
      success: false,
      error: '轮询任务结果超时，请使用任务ID手动查询结果',
      task_id: taskResult.task_id
    };
  }

  /**
   * 提交图生视频任务 - 图片生成视频
   */
  public async submitI2VTask(params: GenerateI2VParams): Promise<VideoTaskSubmitResponse> {
    let lastError: Error | null = null;
    const retries = 1;  // 只重试一次
    let retryCount = 0;
    
    while (retryCount <= retries) {
      try {
        // 准备图片URL数组
        let imageUrls: string[] = [];
        if (params.image_urls && params.image_urls.length > 0) {
          // 优先使用image_urls数组
          imageUrls = params.image_urls;
        } else if (params.image_url) {
          // 如果没有提供image_urls但提供了image_url，则将其转换为数组
          imageUrls = [params.image_url];
        } else {
          throw new Error('缺少必要的参数: image_url 或 image_urls');
        }
        
        // 查询参数 - 使用异步提交任务API
        const queryParams = {
          'Action': 'CVSync2AsyncSubmitTask',
          'Version': '2022-08-31'
        };
        const formattedQuery = this.formatQuery(queryParams);
        
        // 请求体参数 - 默认使用图生视频模型
        const bodyParams = {
          req_key: params.req_key || "jimeng_vgfm_i2v_l20",
          image_urls: imageUrls,
          // 必须指定aspect_ratio参数，不能使用keep_ratio
          aspect_ratio: params.aspect_ratio || "16:9",
          // 如果有提示词则添加
          ...(params.prompt ? { prompt: params.prompt } : {})
        };
        
        const formattedBody = JSON.stringify(bodyParams);
        
        // 调试信息
        console.log('提交任务请求体:', formattedBody);
        
        // 生成签名和请求头
        const { headers, requestUrl } = this.signV4Request(
          formattedQuery,
          formattedBody,
          params.region
        );
        
        // 调试信息
        console.log('提交任务请求URL:', requestUrl);
        console.log('提交任务请求头:', headers);
        
        // 发送请求
        const response = await axios({
          url: requestUrl,
          method: 'POST',
          headers: headers,
          data: formattedBody
        });
        
        // 调试信息
        console.log('提交任务响应状态码:', response.status);
        console.log('提交任务响应数据:', JSON.stringify(response.data, null, 2));
        
        // 处理响应
        if (response.status === 200) {
          if (response.data.status === 10000 || response.data.code === 10000) {
            // 从响应中提取任务ID
            const taskId = response.data.data?.task_id;
            if (!taskId) {
              throw new Error('服务器未返回任务ID');
            }
            
            return {
              success: true,
              task_id: taskId,
              raw_response: response.data
            };
          } else {
            throw new Error(`API错误: ${response.data.message || '未知错误'}, 错误码: ${response.data.code || response.data.status || '无'}`);
          }
        } else {
          throw new Error(`HTTP错误! 状态码: ${response.status}，详细信息: ${JSON.stringify(response.data)}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 提取错误信息，检查是否是由于图片格式问题
        const errorMsg = lastError.message || '';
        if (errorMsg.includes('Image Decode Error') || 
            errorMsg.includes('image format unsupported') ||
            errorMsg.includes('image url')) {
          // 图片格式错误，提供更友好的错误信息
          return {
            success: false,
            error: `图片格式不支持或无法访问。请确保提供的是可公开访问的JPEG或PNG格式图片URL。详细错误: ${errorMsg}`
          };
        }
        
        console.error(`提交图生视频任务尝试 #${retryCount + 1} 失败: ${lastError.message}`);
        
        if (retryCount < retries) {
          // 计算重试等待时间 - 固定为60秒以避免API限流
          const waitSeconds = 60;
          const nextRetryTime = new Date(Date.now() + waitSeconds * 1000);
          const timeString = nextRetryTime.toLocaleTimeString();
          console.log(`提交任务失败，将在 ${timeString} 重试...`);
          
          // 等待指定时间
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          retryCount++;
        } else {
          console.log(`已达到最大重试次数 (${retries})，放弃重试`);
          break;
        }
      }
    }
    
    return {
      success: false,
      error: lastError ? lastError.message : '提交任务失败，已达到最大重试次数'
    };
  }
  
  /**
   * 生成视频 - 图片生成视频 (一步到位方式)
   */
  public async generateI2VVideo(params: GenerateI2VParams): Promise<GenerateVideoResponse> {
    console.log('生成图生视频中...(内部会自动提交任务并轮询结果)');
    
    // 提交任务
    const taskResult = await this.submitI2VTask(params);
    if (!taskResult.success || !taskResult.task_id) {
      return {
        success: false,
        error: taskResult.error || '提交任务失败'
      };
    }
    
    console.log(`任务提交成功，任务ID: ${taskResult.task_id}`);
    console.log('开始轮询任务结果...');
    
    // 轮询查询任务结果 - 复用文生视频的查询结果方法
    const maxAttempts = 30; // 最多等待30次
    const pollingInterval = 5000; // 5秒轮询一次
    
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`轮询任务结果 (${i+1}/${maxAttempts})...`);
      
      // 查询任务结果
      const result = await this.getVideoTaskResult(taskResult.task_id, params.req_key || "jimeng_vgfm_i2v_l20");
      
      if (result.success) {
        // 根据任务状态处理
        if ((result.status === 'SUCCEEDED' || result.status === 'done') && result.video_urls && result.video_urls.length > 0) {
          console.log('视频生成成功!');
          return {
            success: true,
            video_urls: result.video_urls,
            raw_response: result.raw_response,
            task_id: taskResult.task_id
          };
        } else if (result.status === 'FAILED') {
          return {
            success: false,
            error: '视频生成任务失败',
            raw_response: result.raw_response,
            task_id: taskResult.task_id
          };
        } else if (result.status === 'PENDING' || result.status === 'RUNNING' || result.status === 'in_queue') {
          console.log(`任务仍在进行中，状态: ${result.status}，等待 ${pollingInterval/1000} 秒后重试...`);
          // 任务仍在进行中，继续等待
          await new Promise(resolve => setTimeout(resolve, pollingInterval));
          continue;
        }
      }
      
      // 查询失败或状态异常，等待后重试
      console.log('查询任务结果失败或状态异常，等待后重试...');
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
    
    // 超过最大尝试次数
    return {
      success: false,
      error: '轮询任务结果超时，请使用任务ID手动查询结果',
      task_id: taskResult.task_id
    };
  }
}

// 验证键辅助函数
export function verifyKeys(keys: string[], required: string[]): string[] {
  return required.filter(key => !keys.includes(key));
}
